'use client';

// ============================================
// Supabase queries for agent memory notes
// ============================================
import { createClient } from '@/lib/supabase/client';
import { AgentMemory, MemoryType } from '@/types';

const supabase = createClient();

export async function getMemories(agentId: string): Promise<AgentMemory[]> {
  const { data, error } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getMemories error:', error); return []; }
  return data || [];
}

export async function createMemory(agentId: string, memory: {
  title: string;
  content: string;
  memory_type?: MemoryType;
}): Promise<AgentMemory | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('agent_memories')
    .insert({
      agent_id: agentId,
      user_id: user.id,
      title: memory.title,
      content: memory.content,
      memory_type: memory.memory_type || 'manual',
    })
    .select()
    .single();
  if (error) { console.error('createMemory error:', error); return null; }
  return data;
}

export async function updateMemory(id: string, updates: { title?: string; content?: string }): Promise<boolean> {
  const { error } = await supabase
    .from('agent_memories')
    .update(updates)
    .eq('id', id);
  if (error) { console.error('updateMemory error:', error); return false; }
  return true;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const { error } = await supabase.from('agent_memories').delete().eq('id', id);
  if (error) { console.error('deleteMemory error:', error); return false; }
  return true;
}

// Format all memories as markdown for injection into system prompt
export function formatMemoriesForPrompt(memories: AgentMemory[]): string {
  if (memories.length === 0) return '(No memory notes yet.)';

  return memories
    .map((m) => `### ${m.title}\n${m.content}`)
    .join('\n\n');
}
