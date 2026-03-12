'use client';

// ============================================
// Supabase queries for agents and conversations
// ============================================
import { createClient } from '@/lib/supabase/client';
import { Agent, AgentConversation, AgentMessage, DEFAULT_AGENT_PROMPT } from '@/types';

const supabase = createClient();

// ---- Agents ----

export async function getAgents(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('getAgents error:', error); return []; }
  return data || [];
}

export async function getAgent(id: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function createAgent(agent: {
  name: string;
  description?: string;
  icon?: string;
  system_prompt: string;
  auto_learn?: boolean;
  agent_type?: 'chat' | 'analyst';
}): Promise<Agent | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('agents')
    .insert({ user_id: user.id, ...agent })
    .select()
    .single();
  if (error) { console.error('createAgent error:', error); return null; }
  return data;
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<boolean> {
  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', id);
  if (error) { console.error('updateAgent error:', error); return false; }
  return true;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const { error } = await supabase.from('agents').delete().eq('id', id);
  if (error) { console.error('deleteAgent error:', error); return false; }
  return true;
}

// Create the System Analyst agent if one doesn't already exist for this user
export async function ensureSystemAnalyst(): Promise<Agent | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check if an analyst agent already exists
  const { data: existing } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .eq('agent_type', 'analyst')
    .single();

  if (existing) return existing;

  // Create the System Analyst agent
  return createAgent({
    name: 'System Analyst',
    icon: '🔬',
    description: 'Batch-processes raw thoughts into prioritised technical tasks for Opus handoff',
    system_prompt: 'System agent — uses analyst_config table for prompt management',
    auto_learn: false,
    agent_type: 'analyst',
  });
}

// Create the default Personal Assistant if user has no agents,
// and always sync to the latest DEFAULT_AGENT_PROMPT on load
export async function ensureDefaultAgent(): Promise<Agent | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .eq('agent_type', 'chat')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (existing) {
    // Sync to latest DEFAULT_AGENT_PROMPT on every app load
    await supabase
      .from('agents')
      .update({ system_prompt: DEFAULT_AGENT_PROMPT })
      .eq('id', existing.id);
    return existing;
  }

  return createAgent({
    name: 'Personal Assistant',
    description: 'Your AI calendar assistant. Acts immediately on your instructions.',
    icon: '🧠',
    system_prompt: DEFAULT_AGENT_PROMPT,
    auto_learn: true,
  });
}

// ---- Conversations ----

export async function getConversations(agentId: string): Promise<AgentConversation[]> {
  const { data, error } = await supabase
    .from('agent_conversations')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getConversations error:', error); return []; }
  return data || [];
}

export async function createConversation(agentId: string, title?: string): Promise<AgentConversation | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('agent_conversations')
    .insert({ agent_id: agentId, user_id: user.id, title: title || 'New conversation' })
    .select()
    .single();
  if (error) { console.error('createConversation error:', error); return null; }
  return data;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const { error } = await supabase.from('agent_conversations').delete().eq('id', id);
  if (error) { console.error('deleteConversation error:', error); return false; }
  return true;
}

// ---- Messages ----

export async function getMessages(conversationId: string): Promise<AgentMessage[]> {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getMessages error:', error); return []; }
  return data || [];
}

export async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string): Promise<AgentMessage | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('agent_messages')
    .insert({ conversation_id: conversationId, user_id: user.id, role, content })
    .select()
    .single();
  if (error) { console.error('saveMessage error:', error); return null; }
  return data;
}
