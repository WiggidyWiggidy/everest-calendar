'use client';

// ============================================
// Agents Page
// Split layout: Memory Panel (left) + Chat Panel (right)
// Manages agent selection, memory CRUD, and agent lifecycle
// ============================================
import { useState, useEffect, useCallback } from 'react';
import { Agent, AgentMemory, MemorySuggestion } from '@/types';
import {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  ensureDefaultAgent,
} from '@/lib/agents';
import {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
} from '@/lib/memories';
import AgentSelector from '@/components/agents/AgentSelector';
import MemoryPanel from '@/components/agents/MemoryPanel';
import ChatPanel from '@/components/agents/ChatPanel';
import NewAgentDialog from '@/components/agents/NewAgentDialog';
import { Loader2 } from 'lucide-react';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Load agents on mount — ensure default exists
  useEffect(() => {
    async function init() {
      await ensureDefaultAgent();
      const allAgents = await getAgents();
      setAgents(allAgents);

      if (allAgents.length > 0) {
        setActiveAgent(allAgents[0]);
      }
      setLoading(false);
    }
    init();
  }, []);

  // Load memories when active agent changes
  const loadMemories = useCallback(async () => {
    if (!activeAgent) return;
    const mems = await getMemories(activeAgent.id);
    setMemories(mems);
  }, [activeAgent]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // ---- Agent actions ----

  async function handleSelectAgent(agent: Agent) {
    setActiveAgent(agent);
  }

  async function handleCreateAgent(agentData: {
    name: string;
    description?: string;
    icon?: string;
    system_prompt: string;
    auto_learn?: boolean;
  }) {
    const newAgent = await createAgent(agentData);
    if (newAgent) {
      setAgents((prev) => [...prev, newAgent]);
      setActiveAgent(newAgent);
    }
  }

  async function handleUpdateAgent(updates: Partial<Agent>) {
    if (!activeAgent) return;
    const success = await updateAgent(activeAgent.id, updates);
    if (success) {
      const updatedAgent = { ...activeAgent, ...updates };
      setActiveAgent(updatedAgent);
      setAgents((prev) =>
        prev.map((a) => (a.id === activeAgent.id ? updatedAgent : a))
      );
    }
  }

  async function handleDeleteAgent() {
    if (!activeAgent) return;
    // Don't allow deleting the last agent
    if (agents.length <= 1) {
      alert('You must have at least one agent.');
      return;
    }
    const success = await deleteAgent(activeAgent.id);
    if (success) {
      const remaining = agents.filter((a) => a.id !== activeAgent.id);
      setAgents(remaining);
      setActiveAgent(remaining[0] || null);
    }
  }

  // ---- Memory actions ----

  async function handleCreateMemory(memory: { title: string; content: string }) {
    if (!activeAgent) return;
    const newMem = await createMemory(activeAgent.id, {
      ...memory,
      memory_type: 'manual',
    });
    if (newMem) {
      setMemories((prev) => [...prev, newMem]);
    }
  }

  async function handleUpdateMemory(id: string, updates: { title?: string; content?: string }) {
    const success = await updateMemory(id, updates);
    if (success) {
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    }
  }

  async function handleDeleteMemory(id: string) {
    const success = await deleteMemory(id);
    if (success) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  }

  // Handle auto-learn memory suggestion from chat
  async function handleMemorySuggestion(suggestion: MemorySuggestion) {
    if (!activeAgent) return;
    const newMem = await createMemory(activeAgent.id, {
      title: suggestion.title,
      content: suggestion.content,
      memory_type: 'auto',
    });
    if (newMem) {
      setMemories((prev) => [...prev, newMem]);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Agent selector bar */}
      <AgentSelector
        agents={agents}
        activeAgentId={activeAgent?.id || null}
        onSelectAgent={handleSelectAgent}
        onNewAgent={() => setShowNewDialog(true)}
      />

      {/* Split layout */}
      {activeAgent ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Memory Panel */}
          <div className="w-80 shrink-0 hidden md:block">
            <MemoryPanel
              agent={activeAgent}
              memories={memories}
              onCreateMemory={handleCreateMemory}
              onUpdateMemory={handleUpdateMemory}
              onDeleteMemory={handleDeleteMemory}
              onUpdateAgent={handleUpdateAgent}
              onDeleteAgent={handleDeleteAgent}
              onMemoriesReplaced={loadMemories}
            />
          </div>

          {/* Right: Chat Panel */}
          <div className="flex-1 min-w-0">
            <ChatPanel
              agent={activeAgent}
              onMemorySuggestion={handleMemorySuggestion}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">No agents found. Create one to get started.</p>
        </div>
      )}

      {/* New agent dialog */}
      <NewAgentDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreate={handleCreateAgent}
      />
    </div>
  );
}
