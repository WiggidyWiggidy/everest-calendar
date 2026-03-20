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
  conversation_id: string | null;            // links to agent_conversations for outline context
  pr_url: string | null;                     // GitHub PR URL raised by OpenClaw
  pr_number: number | null;                  // GitHub PR number for webhook matching
  branch_name: string | null;               // feature branch created by runner
  build_status:
    | 'queued'
    | 'building'
    | 'pr_raised'
    | 'approved'
    | 'rejected'
    | 'failed'
    | null;
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
- Build tools: create_build_task, get_build_queue, update_task_priority, save_execution_outline
- Thought tools: save_raw_thought, get_raw_thoughts
- Read tools: get_task_backlog, get_system_state

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

// ── Marketing Command Station ──────────────────────────────────────────────

export interface MarketingMetricDaily {
  id: string;
  user_id: string;
  date: string;
  shopify_revenue: number | null;
  shopify_orders: number | null;
  shopify_aov: number | null;
  shopify_sessions: number | null;
  shopify_conversion_rate: number | null;
  shopify_add_to_cart_rate: number | null;
  shopify_checkout_rate: number | null;
  meta_spend: number | null;
  meta_impressions: number | null;
  meta_clicks: number | null;
  meta_ctr: number | null;
  meta_cpm: number | null;
  meta_cpc: number | null;
  meta_roas: number | null;
  meta_purchases: number | null;
  meta_cost_per_purchase: number | null;
  ga_sessions: number | null;
  ga_users: number | null;
  ga_new_users: number | null;
  ga_bounce_rate: number | null;
  ga_avg_session_duration: number | null;
  ga_conversion_rate: number | null;
  clarity_engagement_score: number | null;
  clarity_rage_clicks: number | null;
  clarity_dead_clicks: number | null;
  clarity_avg_scroll_depth: number | null;
  customers_acquired: number | null;
  gross_profit: number | null;
  profit_per_customer: number | null;
  notes: string | null;
  data_source: string;
  created_at: string;
  updated_at: string;
}

export type ExperimentType = 'landing_page' | 'creative' | 'copy' | 'offer' | 'audience' | 'email';
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';
export type ExperimentResult = 'winner' | 'loser' | 'inconclusive' | null;

export interface MarketingExperiment {
  id: string;
  user_id: string;
  name: string;
  type: ExperimentType;
  hypothesis: string | null;
  status: ExperimentStatus;
  start_date: string | null;
  end_date: string | null;
  primary_metric: string | null;
  baseline_value: number | null;
  result_value: number | null;
  lift_percent: number | null;
  result: ExperimentResult;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AssetType = 'creative' | 'copy' | 'landing_page' | 'video' | 'email';
export type AssetStatus = 'draft' | 'in_review' | 'approved' | 'live' | 'archived' | 'rejected';

export interface MarketingAsset {
  id: string;
  user_id: string;
  experiment_id: string | null;
  type: AssetType;
  title: string;
  url: string | null;
  thumbnail_url: string | null;
  status: AssetStatus;
  approval_notes: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Landing Page Builder ────────────────────────────────────────────────────

export type LandingPageStatus = 'monitoring' | 'testing' | 'paused' | 'archived';
export type ProposalStatus = 'pending' | 'approved' | 'user_written' | 'building' | 'live' | 'rejected';
export type MediaAssetCategory = 'product_hero' | 'lifestyle' | 'feature' | 'social_proof' | 'packaging' | 'ingredient' | 'other';
export type SectionType = 'hero' | 'key_benefits' | 'how_it_works' | 'science_proof' | 'social_proof' | 'comparison' | 'faq' | 'cta_banner' | 'setup_3col';

export interface LandingPage {
  id: string;
  user_id: string;
  name: string;
  shopify_url: string;
  shopify_page_id: string | null;
  status: LandingPageStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposedSection {
  type: SectionType;
  headline: string;
  body: string;
  cta_text?: string;
  notes?: string; // AI rationale for including this section
}

export interface PageProposal {
  id: string;
  user_id: string;
  landing_page_id: string;
  diagnosis: string | null;
  proposed_sections: ProposedSection[] | null;
  user_plan: string | null;
  status: ProposalStatus;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  user_id: string;
  storage_path: string;
  public_url: string;
  filename: string;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  ai_category: MediaAssetCategory | null;
  ai_description: string | null;
  ai_tags: string[] | null;
  ai_suitable_for: string[] | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface AssetRequest {
  id: string;
  user_id: string;
  landing_page_id: string | null;
  description: string;
  asset_type: 'image' | 'video';
  status: 'requested' | 'in_progress' | 'done';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageSection {
  type: SectionType;
  headline: string;
  body: string;
  image_url?: string;
  cta_text?: string;
  cta_url?: string;
}

export interface AnalystProposalPayload {
  diagnosis: string;
  root_causes: string[];
  proposed_sections: ProposedSection[];
  priority: 'high' | 'medium';
  expected_lift: string;
  key_metrics: string[];
}

// ============================================
// Upwork Candidate Pipeline
// ============================================

export type CandidateTier = 'top' | 'maybe' | 'reject';
export type CandidateStatus = 'new' | 'messaged' | 'trialled' | 'hired' | 'rejected';

export interface UpworkCandidate {
  id: string;
  user_id: string;
  name: string;
  upwork_profile_url?: string | null;
  hourly_rate?: number | null;
  job_success_score?: number | null;
  location?: string | null;
  score?: number | null;
  tier: CandidateTier;
  status: CandidateStatus;
  proposal_snippet?: string | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  manufacturing_experience?: string | null;
  cad_software?: string[] | null;
  enclosures_count?: number | null;
  evaluator_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export const CANDIDATE_TIER_COLORS: Record<CandidateTier, { bg: string; text: string; dot: string }> = {
  top:    { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  maybe:  { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  reject: { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
};

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  new:      'New',
  messaged: 'Messaged',
  trialled: 'Trialled',
  hired:    'Hired',
  rejected: 'Rejected',
};

// ============================================
// WhatsApp Cowork Thread
// ============================================

export type CoworkMessageStatus    = 'received' | 'draft' | 'sent';
export type CoworkMessageDirection = 'inbound' | 'outbound';

export interface CoworkMessage {
  id:          string;
  user_id:     string;
  status:      CoworkMessageStatus;
  direction:   CoworkMessageDirection;
  sender_name: string | null;
  content:     string;
  parent_id:   string | null;
  media_url:   string | null;
  media_type:  string | null;
  sent_at:     string | null;
  created_at:  string;
  updated_at:  string;
}

// Represents a single tool call made by the assistant
export interface ActionTaken {
  tool: 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event'
      | 'get_calendar_events' | 'get_launch_tasks' | 'update_launch_task'
      | 'batch_update_calendar_events' | 'save_raw_thought'
      | 'create_build_task' | 'get_build_queue' | 'update_task_priority'
      | 'get_raw_thoughts' | 'get_task_backlog' | 'get_system_state'
      | 'save_execution_outline'
      | 'get_candidates' | 'update_candidate_status'
      | 'get_cowork_thread'
      | 'get_manufacturers';
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}
