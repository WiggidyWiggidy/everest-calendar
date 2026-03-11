'use client';

// ============================================
// AgentSelector
// Tab bar to switch between agents + button to create new ones
// ============================================
import { Agent } from '@/types';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentSelectorProps {
  agents: Agent[];
  activeAgentId: string | null;
  onSelectAgent: (agent: Agent) => void;
  onNewAgent: () => void;
}

export default function AgentSelector({
  agents,
  activeAgentId,
  onSelectAgent,
  onNewAgent,
}: AgentSelectorProps) {
  return (
    <div className="flex items-center gap-2 border-b bg-white px-4 py-2 overflow-x-auto">
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onSelectAgent(agent)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
            activeAgentId === agent.id
              ? agent.agent_type === 'analyst'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-indigo-100 text-indigo-700'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          )}
        >
          <span>{agent.icon}</span>
          <span>{agent.name}</span>
        </button>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={onNewAgent}
        className="shrink-0 text-gray-400 hover:text-gray-600"
      >
        <Plus className="h-4 w-4 mr-1" />
        New Agent
      </Button>
    </div>
  );
}
