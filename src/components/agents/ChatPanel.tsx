'use client';

// ============================================
// ChatPanel
// Right panel — conversation with the active agent
// Handles sending messages, parsing event suggestions,
// and detecting memory suggestions from auto-learn
// ============================================
import { useState, useEffect, useRef } from 'react';
import { Agent, AgentConversation, AgentMessage, SuggestedEvent, MemorySuggestion, EventFormData, CATEGORY_COLORS, CATEGORY_LABELS } from '@/types';
import { getMessages, saveMessage, createConversation, getConversations } from '@/lib/agents';
import { useEvents } from '@/lib/hooks/useEvents';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import MemorySuggestionBanner from './MemorySuggestionBanner';
import {
  Send,
  Bot,
  User,
  CalendarPlus,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
  agent: Agent;
  onMemorySuggestion: (suggestion: MemorySuggestion) => void;
}

export default function ChatPanel({ agent, onMemorySuggestion }: ChatPanelProps) {
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingSuggestion, setPendingSuggestion] = useState<MemorySuggestion | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { events, createEvent } = useEvents();

  // Load or create conversation when agent changes
  useEffect(() => {
    async function init() {
      setLoading(true);
      setMessages([]);
      setConversation(null);

      // Get existing conversations for this agent
      const convos = await getConversations(agent.id);

      if (convos.length > 0) {
        // Use the most recent conversation
        setConversation(convos[0]);
        const msgs = await getMessages(convos[0].id);
        setMessages(msgs);
      } else {
        // Create a new conversation
        const newConvo = await createConversation(agent.id, 'New conversation');
        setConversation(newConvo);
      }

      setLoading(false);
    }
    init();
  }, [agent.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Extract event suggestions from assistant response
  function parseSuggestedEvents(content: string): SuggestedEvent[] {
    const regex = /```event\s*\n([\s\S]*?)```/g;
    const suggestions: SuggestedEvent[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        suggestions.push(JSON.parse(match[1]));
      } catch { /* skip malformed */ }
    }
    return suggestions;
  }

  // Extract memory suggestions from assistant response
  function parseMemorySuggestions(content: string): MemorySuggestion[] {
    const regex = /<memory_suggestion>\s*\n([\s\S]*?)<\/memory_suggestion>/g;
    const suggestions: MemorySuggestion[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        suggestions.push(JSON.parse(match[1]));
      } catch { /* skip malformed */ }
    }
    return suggestions;
  }

  // Add a suggested event to calendar
  async function handleAddSuggested(suggestion: SuggestedEvent) {
    const formData: EventFormData = { ...suggestion, status: 'planned', is_big_mover: false };
    const success = await createEvent(formData);

    const statusMsg: AgentMessage = {
      id: 'status-' + Date.now(),
      conversation_id: conversation?.id || '',
      user_id: '',
      role: 'assistant',
      content: success
        ? `Added "${suggestion.title}" to your calendar on ${suggestion.event_date}.`
        : `Couldn't add "${suggestion.title}" to your calendar. Check your Supabase setup.`,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, statusMsg]);
  }

  // Send message to the agent
  async function handleSend() {
    if (!input.trim() || sending || !conversation) return;

    const userText = input.trim();
    setInput('');
    setSending(true);

    // Save user message
    const savedUser = await saveMessage(conversation.id, 'user', userText);
    if (savedUser) {
      setMessages((prev) => [...prev, savedUser]);
    }

    try {
      // Build recent messages for context (last 20)
      const recentMessages = [
        ...messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userText },
      ];

      // Call API with agent context
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: recentMessages,
          events,
          agent_id: agent.id,
        }),
      });

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      // Save assistant response
      const savedAssistant = await saveMessage(conversation.id, 'assistant', data.message);
      if (savedAssistant) {
        setMessages((prev) => [...prev, savedAssistant]);
      }

      // Check for memory suggestions (auto-learn)
      if (agent.auto_learn) {
        const memorySuggestions = parseMemorySuggestions(data.message);
        if (memorySuggestions.length > 0) {
          setPendingSuggestion(memorySuggestions[0]);
          onMemorySuggestion(memorySuggestions[0]);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg: AgentMessage = {
        id: 'error-' + Date.now(),
        conversation_id: conversation.id,
        user_id: '',
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setSending(false);
  }

  // Handle Enter key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Start a new conversation
  async function handleNewConversation() {
    const newConvo = await createConversation(agent.id, 'New conversation');
    if (newConvo) {
      setConversation(newConvo);
      setMessages([]);
    }
  }

  // Render message content with event suggestion cards
  function renderMessageContent(content: string) {
    const suggestions = parseSuggestedEvents(content);
    // Remove event blocks and memory suggestion blocks from display
    const cleanContent = content
      .replace(/```event\s*\n[\s\S]*?```/g, '')
      .replace(/<memory_suggestion>\s*\n[\s\S]*?<\/memory_suggestion>/g, '')
      .trim();

    return (
      <>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{cleanContent}</div>

        {suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion, i) => {
              const colors = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.product;
              return (
                <div key={i} className="border rounded-lg p-3 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{suggestion.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {suggestion.event_date}
                        {suggestion.event_time && ` at ${suggestion.event_time}`}
                      </p>
                      {suggestion.description && (
                        <p className="text-xs text-gray-400 mt-1">{suggestion.description}</p>
                      )}
                      <div className="flex gap-1 mt-2">
                        <Badge variant="outline" className={cn('text-xs', colors.bg, colors.text)}>
                          {CATEGORY_LABELS[suggestion.category]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {suggestion.priority}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => handleAddSuggested(suggestion)}
                    >
                      <CalendarPlus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agent.icon}</span>
          <h3 className="font-semibold text-gray-900 text-sm">{agent.name}</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={handleNewConversation}>
          <MessageSquare className="h-3 w-3 mr-1" />
          New Chat
        </Button>
      </div>

      {/* Memory suggestion banner */}
      {pendingSuggestion && (
        <MemorySuggestionBanner
          suggestion={pendingSuggestion}
          onSave={() => {
            onMemorySuggestion(pendingSuggestion);
            setPendingSuggestion(null);
          }}
          onDismiss={() => setPendingSuggestion(null)}
        />
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20">
            <Bot className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              Start chatting with {agent.name}. It remembers things you teach it.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {[
                'Help me plan a product launch',
                'What milestones should I set?',
                'Review my calendar events',
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="text-xs px-3 py-1.5 rounded-full border text-gray-500 hover:bg-gray-50 transition-colors"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-indigo-600" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-xl px-4 py-3',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  )}
                >
                  {msg.role === 'assistant'
                    ? renderMessageContent(msg.content)
                    : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  }
                </div>
                {msg.role === 'user' && (
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="bg-gray-100 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="border-t p-4 bg-white">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}...`}
            className="resize-none min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <Button onClick={handleSend} disabled={!input.trim() || sending} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
