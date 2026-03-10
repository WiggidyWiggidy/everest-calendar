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
