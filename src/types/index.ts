// ============================================
// Core type definitions for Everest Calendar
// ============================================

// Event categories with their display colors
export type EventCategory = 'product' | 'marketing' | 'content' | 'meeting' | 'deadline';
export type EventPriority = 'high' | 'medium' | 'low';
export type EventStatus = 'planned' | 'in-progress' | 'done';

// Maps each category to its Tailwind color class
export const CATEGORY_COLORS: Record<EventCategory, { bg: string; text: string; dot: string }> = {
  product:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  marketing: { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  content:   { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  meeting:   { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  deadline:  { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
};

// Human-readable labels for categories
export const CATEGORY_LABELS: Record<EventCategory, string> = {
  product: 'Product',
  marketing: 'Marketing',
  content: 'Content',
  meeting: 'Meeting',
  deadline: 'Deadline',
};

// Priority badge styles
export const PRIORITY_COLORS: Record<EventPriority, { bg: string; text: string }> = {
  high:   { bg: 'bg-red-100',    text: 'text-red-700' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  low:    { bg: 'bg-gray-100',   text: 'text-gray-600' },
};

// Calendar event as stored in Supabase
export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;       // 'YYYY-MM-DD' format
  event_time: string | null; // 'HH:MM' format
  category: EventCategory;
  priority: EventPriority;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

// Form data when creating/editing an event (no id, user_id, timestamps)
export interface EventFormData {
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  category: EventCategory;
  priority: EventPriority;
  status: EventStatus;
}

// Chat message as stored in Supabase
export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Shape of a suggested event from the chat assistant
export interface SuggestedEvent {
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  category: EventCategory;
  priority: EventPriority;
}

// ============================================
// Agent Memory System Types
// ============================================

export type MemoryType = 'manual' | 'auto' | 'system_prompt';

// An AI agent with a specific role and persistent memory
export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string;
  system_prompt: string;
  auto_learn: boolean;
  last_optimised_at: string | null; // set after memory optimiser runs
  created_at: string;
  updated_at: string;
}

// A memory note attached to an agent
export interface AgentMemory {
  id: string;
  agent_id: string;
  user_id: string;
  title: string;
  content: string;
  memory_type: MemoryType;
  is_archived: boolean;  // soft-deleted by the memory optimiser
  created_at: string;
  updated_at: string;
}

// A raw note shape returned/accepted by the optimiser
export interface OptimisedNote {
  title: string;
  content: string;
}

// Result returned from the /api/agents/optimise-memory route
export interface OptimiseResult {
  original: OptimisedNote[];
  optimised: OptimisedNote[];
  stats: {
    originalCount: number;
    optimisedCount: number;
    delta: number; // negative = notes were merged/removed
  };
}

// A conversation session with an agent
export interface AgentConversation {
  id: string;
  agent_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

// A single message within a conversation
export interface AgentMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Memory suggestion extracted from assistant response
export interface MemorySuggestion {
  title: string;
  content: string;
}

// Default system prompt for the Personal Assistant agent
export const DEFAULT_AGENT_PROMPT = `You are a personal assistant for product launch planning at Everest Labs.
You help with timeline management, task prioritization, and strategic advice.

Key behaviours:
- Be concise and actionable
- Reference the user's calendar events when relevant
- If the user corrects you or gives feedback, acknowledge it clearly
- When you learn something important about the user's preferences or project, suggest saving it as a memory note

You have access to the following memory notes which contain things you've learned:
{memory_notes}`;
