'use client';

// ============================================
// Chat Page
// Chat interface with Claude as a launch planning strategist
// Messages persist in Supabase, events passed as context
// ============================================
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useEvents } from '@/lib/hooks/useEvents';
import { ChatMessage, SuggestedEvent, EventFormData, CATEGORY_COLORS, CATEGORY_LABELS } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  User,
  Sparkles,
  CalendarPlus,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { events, createEvent } = useEvents();

  // Load chat history from Supabase
  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (data) setMessages(data);
      setLoadingHistory(false);
    }
    loadMessages();
  }, [supabase]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Extract suggested events from assistant messages
  function parseSuggestedEvents(content: string): SuggestedEvent[] {
    const regex = /```event\s*\n([\s\S]*?)```/g;
    const suggestions: SuggestedEvent[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        suggestions.push(parsed);
      } catch {
        // Skip malformed JSON
      }
    }
    return suggestions;
  }

  // Add a suggested event to the calendar
  async function handleAddSuggested(suggestion: SuggestedEvent) {
    const formData: EventFormData = {
      ...suggestion,
      status: 'planned',
      is_big_mover: false,
    };
    const success = await createEvent(formData);
    if (success) {
      // Show a brief in-chat confirmation instead of a blocking alert
      const confirmMsg: ChatMessage = {
        id: 'confirm-' + Date.now(),
        user_id: '',
        role: 'assistant',
        content: `✅ "${suggestion.title}" has been added to your calendar on ${suggestion.event_date}. Head to the Calendar page to see it!`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } else {
      const errorMsg: ChatMessage = {
        id: 'error-' + Date.now(),
        user_id: '',
        role: 'assistant',
        content: `❌ Couldn't add "${suggestion.title}" to your calendar. Make sure you've run the Supabase schema SQL — check the supabase/schema.sql file in your project.`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }

  // Send a message to Claude
  async function handleSend() {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Save user message to Supabase
    const { data: savedUserMsg } = await supabase
      .from('chat_messages')
      .insert({ user_id: user.id, role: 'user', content: userMessage })
      .select()
      .single();

    if (savedUserMsg) {
      setMessages((prev) => [...prev, savedUserMsg]);
    }

    try {
      // Build message history for context (last 20 messages)
      const recentMessages = [...messages.slice(-20), { role: 'user' as const, content: userMessage }]
        .map((m) => ({ role: m.role, content: m.content }));

      // Call our API route (which proxies to Anthropic)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: recentMessages,
          events: events, // Pass calendar events as context
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Save assistant message to Supabase
      const { data: savedAssistantMsg } = await supabase
        .from('chat_messages')
        .insert({ user_id: user.id, role: 'assistant', content: data.message })
        .select()
        .single();

      if (savedAssistantMsg) {
        setMessages((prev) => [...prev, savedAssistantMsg]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      // Show error as a system message
      const errorMsg: ChatMessage = {
        id: 'error-' + Date.now(),
        user_id: user.id,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setSending(false);
  }

  // Handle Enter key (Shift+Enter for newline)
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Render message content with suggested event cards
  function renderMessageContent(content: string) {
    const suggestions = parseSuggestedEvents(content);
    // Remove the event JSON blocks from the displayed text
    const cleanContent = content.replace(/```event\s*\n[\s\S]*?```/g, '').trim();

    return (
      <>
        {/* Render text with basic markdown-like formatting */}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {cleanContent}
        </div>

        {/* Render suggested event cards */}
        {suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion, i) => {
              const colors = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.product;
              return (
                <div
                  key={i}
                  className="border rounded-lg p-3 bg-white shadow-sm"
                >
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
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-indigo-600" />
          Launch Assistant
        </h1>
        <p className="text-gray-500 text-sm">
          Chat with your AI launch strategist. It knows about your calendar events.
        </p>
      </div>

      {/* Chat messages area */}
      <div className="flex-1 bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <Bot className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">
                Start a conversation! Ask about launch planning, timelines, or strategies.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {[
                  'Help me plan a product launch',
                  'What milestones should I set?',
                  'Review my calendar and suggest improvements',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    className="text-xs px-3 py-1.5 rounded-full border text-gray-500 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setInput(prompt);
                    }}
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
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about launch strategy, timelines, or event planning..."
              className="resize-none min-h-[44px] max-h-[120px]"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
