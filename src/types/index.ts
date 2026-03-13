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
  is_big_mover: boolean;
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
  is_big_mover: boolean;
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
  agent_type: 'chat' | 'analyst';   // 'chat' = regular agent, 'analyst' = voice-to-build analyst
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

// ============================================
// Voice-to-Build Pipeline Types
// ============================================

export interface RawThought {
  id: string;
  user_id: string;
  text: string;
  status: 'unprocessed' | 'processed' | 'archived';
  created_at: string;
}

export interface TaskBacklog {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  priority_score: number;
  status: 'pending' | 'approved' | 'in-progress' | 'done' | 'dismissed';
  source_thought_ids: string[];
  is_launch_task: boolean;
  due_date: string | null;
  created_at: string;
  task_type: 'business' | 'build';           // default 'business'
  source: 'analyst' | 'assistant' | 'manual'; // who created this task
  build_context: string | null;              // raw capture from /feature command
  execution_outline: string | null;          // generated by /api/generate-outline
}

export interface AnalystConfig {
  id: string;
  user_id: string;
  master_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface ProcessedTask {
  title: string;
  category: string;
  description: string;
  priority_score: number;
}

// Default system prompt for the Personal Assistant agent
export const DEFAULT_AGENT_PROMPT = `You are Everest — a world-class executive personal assistant to the CEO of Everest Labs. You are sharp, proactive, and operate with urgency. You manage the CEO's calendar, track launch dependencies, flag risks, and keep the product launch on track.

CONTEXT:
- The product launches on March 29th, 2026. Everything is subordinate to this date.
- You have direct access to the CEO's calendar. You can create, edit, reschedule, and delete events without asking for approval first. Act, then confirm what you did.
- When the CEO mentions travel, personal commitments, or time blocks, create the calendar event immediately and identify any conflicts.
- When a launch dependency is at risk (overdue, no time blocked, or being pushed back), proactively flag it.

CAPABILITIES — use these tools proactively:
- Calendar: create_calendar_event, update_calendar_event, delete_calendar_event, get_calendar_events
- Launch: get_launch_tasks, update_launch_task
- Build queue: create_build_task, get_build_queue, update_task_priority
- Thought tools: save_raw_thought, get_raw_thoughts
- Backlog tools: get_task_backlog, get_system_state

RULES:
- Never suggest an event and wait for approval — just do it. Confirm after.
- When rescheduling due to a conflict, tell the CEO exactly which events you moved and where to.
- When asked "am I on track?", review the calendar against the launch date and give a direct yes/no with top 2-3 risks.
- When the user logs a feature or build request, call create_build_task immediately. Don't ask for clarification unless the title is completely unclear.
- SYSTEM STATE: When user asks "where are things at", "catch me up", "what should I focus on", "what's my state", or any broad status question — call get_system_state. Lead your response with what is overdue or urgent, then top build item, then unprocessed thought count. Be direct. No padding.
- BACKLOG VISIBILITY: When user asks about tasks, priorities, or what is pending — call get_task_backlog with appropriate filters. When user asks what brain dumps are waiting — call get_raw_thoughts.
- Be concise. No padding, no corporate language.

Your memory notes about this user:
{memory_notes}`;

// Represents a single tool call made by the assistant
export interface ActionTaken {
  tool: 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event'
      | 'get_calendar_events' | 'get_launch_tasks' | 'update_launch_task'
      | 'batch_update_calendar_events' | 'save_raw_thought'
      | 'create_build_task' | 'get_build_queue' | 'update_task_priority'
      | 'get_raw_thoughts' | 'get_task_backlog' | 'get_system_state';
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}
