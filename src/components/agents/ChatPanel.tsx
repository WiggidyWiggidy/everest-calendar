'use client';

// ============================================
// ChatPanel
// Right panel — conversation with the active agent
// Routes all messages through /api/assistant (agentic tool-use loop).
// Displays inline action summary strips below assistant messages.
// Memory auto-learn still supported via <memory_suggestion> blocks.
// ============================================
import { useState, useEffect, useRef } from 'react';
import {
  Agent,
  AgentConversation,
  AgentMessage,
  MemorySuggestion,
  ActionTaken,
} from '@/types';
import { getMessages, saveMessage, createConversation, getConversations } from '@/lib/agents';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import MemorySuggestionBanner from './MemorySuggestionBanner';
import {
  Send,
  Bot,
  User,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Local extended type — adds actions_taken to in-memory messages (not persisted to DB)
type AgentMessageWithActions = AgentMessage & { actions_taken?: ActionTaken[] };

interface ChatPanelProps {
  agent: Agent;
  onMemorySuggestion: (suggestion: MemorySuggestion) => void;
}

export default function ChatPanel({ agent, onMemorySuggestion }: ChatPanelProps) {
  const [conversation, setConversation]       = useState<AgentConversation | null>(null);
  const [messages, setMessages]               = useState<AgentMessageWithActions[]>([]);
  const [input, setInput]                     = useState('');
  const [sending, setSending]                 = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [pendingSuggestion, setPendingSuggestion] = useState<MemorySuggestion | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load or create conversation when agent changes
  useEffect(() => {
    async function init() {
      setLoading(true);
      setMessages([]);
      setConversation(null);

      const convos = await getConversations(agent.id);

      if (convos.length > 0) {
        setConversation(convos[0]);
        const msgs = await getMessages(convos[0].id);
        setMessages(msgs as AgentMessageWithActions[]);
      } else {
        const newConvo = await createConversation(agent.id, 'New conversation');
        setConversation(newConvo);
      }

      setLoading(false);
    }
    init();
  }, [agent.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Extract memory suggestions from assistant response text
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

  // Send message through the agentic assistant route
  async function handleSend() {
    if (!input.trim() || sending || !conversation) return;

    const userText = input.trim();
    setInput('');
    setSending(true);

    // Persist and display user message
    const savedUser = await saveMessage(conversation.id, 'user', userText);
    if (savedUser) {
      setMessages((prev) => [...prev, savedUser as AgentMessageWithActions]);
    }

    try {
      // Build recent message history for context (last 20)
      const recentMessages = [
        ...messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userText },
      ];

      // /api/assistant runs the full agentic loop server-side
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: recentMessages,
          agent_id: agent.id,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Persist assistant message, attach actions_taken for in-memory display
      const savedAssistant = await saveMessage(conversation.id, 'assistant', data.message);
      if (savedAssistant) {
        const messageWithActions: AgentMessageWithActions = {
          ...savedAssistant,
          actions_taken: (data.actions_taken || []) as ActionTaken[],
        };
        setMessages((prev) => [...prev, messageWithActions]);
      }

      // Auto-learn: surface memory suggestions to parent
      if (agent.auto_learn) {
        const memorySuggestions = parseMemorySuggestions(data.message);
        if (memorySuggestions.length > 0) {
          setPendingSuggestion(memorySuggestions[0]);
          onMemorySuggestion(memorySuggestions[0]);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg: AgentMessageWithActions = {
        id: 'error-' + Date.now(),
        conversation_id: conversation.id,
        user_id: '',
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
        actions_taken: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleNewConversation() {
    const newConvo = await createConversation(agent.id, 'New conversation');
    if (newConvo) {
      setConversation(newConvo);
      setMessages([]);
    }
  }

  // Render assistant message — strip memory blocks, show action summary strip
  function renderMessageContent(msg: AgentMessageWithActions) {
    const cleanContent = msg.content
      .replace(/<memory_suggestion>\s*\n[\s\S]*?<\/memory_suggestion>/g, '')
      .trim();

    return (
      <>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{cleanContent}</div>
        {msg.actions_taken && msg.actions_taken.length > 0 && (
          <ActionsSummary actions={msg.actions_taken} />
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
                'Am I on track for launch?',
                "What's on my calendar this week?",
                "I'm flying to Bali Tuesday 10pm — block it out",
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
                    ? renderMessageContent(msg)
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

// ── ActionsSummary ─────────────────────────────────────────────────────────────
// Compact strip showing what the assistant did autonomously in this turn
function ActionsSummary({ actions }: { actions: ActionTaken[] }) {
  if (!actions || actions.length === 0) return null;

  function actionLabel(action: ActionTaken): string {
    const input  = action.input;
    const result = action.result;

    if (!result.success) return `⚠️ Failed: ${action.tool}`;

    if (action.tool === 'create_calendar_event') {
      return `✅ Created "${input.title}" — ${input.event_date}${input.event_time ? ` at ${input.event_time}` : ''}`;
    }
    if (action.tool === 'update_calendar_event') {
      const parts: string[] = [];
      if (input.event_date) parts.push(`→ ${input.event_date}`);
      if (input.status)     parts.push(`status: ${input.status}`);
      return `✅ Updated event${parts.length > 0 ? ' ' + parts.join(', ') : ''}`;
    }
    if (action.tool === 'delete_calendar_event') {
      return `🗑️ Deleted event`;
    }
    if (action.tool === 'get_calendar_events') {
      const events = (result.events as unknown[]) || [];
      return `📅 Fetched ${events.length} event${events.length !== 1 ? 's' : ''}`;
    }
    if (action.tool === 'get_launch_tasks') {
      const tasks = (result.tasks as unknown[]) || [];
      return `📋 Fetched ${tasks.length} open launch task${tasks.length !== 1 ? 's' : ''}`;
    }
    if (action.tool === 'update_launch_task') {
      return `✅ "${result.title}" marked ${result.new_status}`;
    }
    if (action.tool === 'batch_update_calendar_events') {
      const count = result.updated as number;
      return `✅ ${count} event${count !== 1 ? 's' : ''} marked ${result.new_status}`;
    }
    if (action.tool === 'save_raw_thought') {
      return `🧠 Brain dump saved for Analyst`;
    }
    return `✅ ${action.tool}`;
  }

  return (
    <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg p-2 space-y-1">
      {actions.map((action, i) => (
        <p key={i} className="text-xs text-indigo-700">
          {actionLabel(action)}
        </p>
      ))}
    </div>
  );
}
