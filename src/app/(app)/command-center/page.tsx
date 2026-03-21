'use client';

// ============================================
// /command-center — Agent Autonomy Dashboard
// Answers: "Are my agents getting better at working without me?"
// Structure: Autonomy Hero → Signal Cards → Activity Feed + Decision Queue
//            → Agent Grid → Pipeline Progress
// ============================================
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CommandCenterData,
  AgentHealthStatus,
  CoworkAgentHealth,
  AgentActivityEntry,
  PipelineTrack,
  PlatformInboxItem,
  AutonomyWeek,
  INBOX_PLATFORM_COLORS,
  AgentHealthColor,
} from '@/types';
import { cn } from '@/lib/utils';
import {
  Activity,
  Bot,
  AlertCircle,
  CheckCircle2,
  Clock,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  Zap,
  AlertTriangle,
  Info,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthDot(health: AgentHealthColor) {
  const colours = {
    green: 'bg-green-400',
    amber: 'bg-amber-400',
    red:   'bg-red-400',
  };
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', colours[health])} />;
}

// ── Signal card ───────────────────────────────────────────────────────────────

type SignalColor = 'green' | 'amber' | 'red';

function signalBorder(color: SignalColor) {
  return color === 'green' ? 'border-l-green-400'
       : color === 'amber' ? 'border-l-amber-400'
       : 'border-l-red-400';
}

function SignalCard({
  label, value, subtitle, color, onClick,
}: {
  label: string; value: string | number; subtitle?: string;
  color: SignalColor; onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        'border-l-4 cursor-default transition-shadow',
        signalBorder(color),
        onClick && 'cursor-pointer hover:shadow-md'
      )}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <p className="text-3xl font-bold mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ── Autonomy hero ─────────────────────────────────────────────────────────────

function AutonomyHero({ data }: { data: CommandCenterData }) {
  const { autonomy_rate, auto_actions_7d, manual_actions_7d, autonomy_trend } = data;
  const bg = autonomy_rate >= 80 ? 'bg-green-900' : autonomy_rate >= 50 ? 'bg-amber-900' : 'bg-red-900';
  const text = autonomy_rate >= 80 ? 'text-green-100' : autonomy_rate >= 50 ? 'text-amber-100' : 'text-red-100';
  const accent = autonomy_rate >= 80 ? 'text-green-300' : autonomy_rate >= 50 ? 'text-amber-300' : 'text-red-300';

  const maxRate = Math.max(...autonomy_trend.map(w => w.rate), 1);

  return (
    <Card className={cn('border-0', bg)}>
      <CardContent className="pt-5 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Left: big number */}
          <div className="flex-1">
            <p className={cn('text-sm font-medium mb-1', text, 'opacity-70')}>
              Autonomy Rate — Last 7 Days
            </p>
            <p className={cn('text-6xl font-black leading-none', accent)}>
              {autonomy_rate}%
            </p>
            <p className={cn('text-sm mt-2', text, 'opacity-70')}>
              {auto_actions_7d} autonomous action{auto_actions_7d !== 1 ? 's' : ''},{' '}
              {manual_actions_7d} needed your input
            </p>
          </div>

          {/* Right: 4-week trend bars */}
          <div className="flex items-end gap-2 h-14">
            {autonomy_trend.map((week, i) => {
              const heightPct = maxRate === 0 ? 0 : Math.max(4, (week.rate / maxRate) * 100);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className={cn('w-8 rounded-sm', accent, 'opacity-80')}
                    style={{ height: `${heightPct}%`, minHeight: 4, backgroundColor: 'currentColor' }}
                    title={`${week.week_label}: ${week.rate}%`}
                  />
                  <span className={cn('text-xs', text, 'opacity-50 hidden sm:block')}>{week.week_label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  auto_action: Zap,
  decision:    AlertTriangle,
  learning:    Brain,
  info:        Info,
  error:       XCircle,
  handoff:     ArrowRight,
  draft:       Activity,
  approval:    CheckCircle2,
};

const ACTIVITY_DOT: Record<string, string> = {
  auto_action: 'bg-green-400',
  decision:    'bg-amber-400',
  learning:    'bg-blue-400',
  info:        'bg-blue-400',
  error:       'bg-red-400',
  handoff:     'bg-amber-400',
  draft:       'bg-slate-400',
  approval:    'bg-green-400',
};

type FeedFilter = 'all' | 'vercel' | 'cowork';

function ActivityFeed({ items }: { items: AgentActivityEntry[] }) {
  const [filter, setFilter] = useState<FeedFilter>('all');

  const visible = filter === 'all' ? items
    : items.filter(i => i.agent_source === filter);

  const filters: { key: FeedFilter; label: string }[] = [
    { key: 'all',    label: 'All' },
    { key: 'vercel', label: 'Vercel' },
    { key: 'cowork', label: 'Cowork' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          What happened without you
        </h2>
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border transition-colors',
                filter === f.key
                  ? 'bg-foreground text-background border-foreground'
                  : 'text-muted-foreground border-border hover:border-foreground/30'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          No activity in the last 48 hours
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {visible.map(entry => {
            const dot = ACTIVITY_DOT[entry.activity_type] ?? 'bg-slate-400';
            return (
              <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
                <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{entry.agent_name}</span>
                    <Badge variant="outline" className="text-xs py-0 px-1.5">
                      {entry.agent_source}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{entry.description}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(entry.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Decision queue ────────────────────────────────────────────────────────────

function DecisionQueue({ items }: { items: PlatformInboxItem[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Waiting for you
          {items.length > 0 && (
            <span className="ml-2 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-bold">
              {items.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => router.push('/inbox')}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          All in Inbox <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          <p className="text-sm font-medium">Nothing waiting — autonomy is unblocked</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => {
            const platform = item.platform as keyof typeof INBOX_PLATFORM_COLORS;
            const colors = INBOX_PLATFORM_COLORS[platform];
            const waitMs = Date.now() - new Date(item.created_at).getTime();
            const waitH = waitMs / (1000 * 60 * 60);
            const urgentWait = waitH > 4;
            return (
              <button
                key={item.id}
                onClick={() => router.push('/inbox')}
                className="text-left w-full p-3 rounded-lg border border-border hover:border-foreground/30 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', colors.bg, colors.text)}>
                    {item.platform}
                  </span>
                  <span className="text-sm font-medium">{item.contact_name ?? 'Unknown'}</span>
                  <span className={cn('ml-auto text-xs', urgentWait ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                {item.ai_summary && (
                  <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{item.ai_summary}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agent grid ────────────────────────────────────────────────────────────────

function VercelAgentCard({ agent }: { agent: AgentHealthStatus }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {healthDot(agent.health)}
        <span className="font-medium text-sm">{agent.agent_name}</span>
        <Badge variant="outline" className="text-xs py-0 px-1.5 ml-auto">Vercel</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Last run: {timeAgo(agent.last_run_at)}
      </p>
      <p className="text-xs text-muted-foreground">
        Status: <span className={cn(
          'font-medium',
          agent.last_status === 'success' ? 'text-green-600' :
          agent.last_status === 'error'   ? 'text-red-600'   : 'text-amber-600'
        )}>{agent.last_status}</span>
      </p>
      {agent.items_processed > 0 && (
        <p className="text-xs text-muted-foreground">
          Processed: {agent.items_processed} item{agent.items_processed !== 1 ? 's' : ''}
        </p>
      )}
      {agent.error_message && (
        <p className="text-xs text-red-600 mt-1 line-clamp-2">{agent.error_message}</p>
      )}
    </Card>
  );
}

function CoworkAgentCard({ agent }: { agent: CoworkAgentHealth }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {healthDot(agent.health)}
        <span className="font-medium text-sm">{agent.name}</span>
        <Badge variant="outline" className="text-xs py-0 px-1.5 ml-auto">Cowork</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Memories: <span className="font-medium text-foreground">{agent.memory_count}</span>
      </p>
      {agent.last_active_at && (
        <p className="text-xs text-muted-foreground">
          Last active: {timeAgo(agent.last_active_at)}
        </p>
      )}
      {agent.latest_memory_title && (
        <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
          Last learned: {agent.latest_memory_title}
        </p>
      )}
    </Card>
  );
}

function AgentGrid({
  vercelAgents, coworkAgents,
}: {
  vercelAgents: AgentHealthStatus[];
  coworkAgents: CoworkAgentHealth[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        Your team
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {vercelAgents.map(a => <VercelAgentCard key={a.agent_name} agent={a} />)}
        {coworkAgents.map(a => <CoworkAgentCard key={a.id} agent={a} />)}
      </div>
    </div>
  );
}

// ── Pipeline tracks ───────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  done:        'bg-green-100 text-green-700 border-green-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  blocked:     'bg-red-100 text-red-700 border-red-300',
  not_started: 'bg-muted text-muted-foreground border-border',
};

function PipelineRow({ track }: { track: PipelineTrack }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{track.name}</p>
      <div className="flex items-center gap-1 flex-wrap">
        {track.nodes.map((node, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className={cn(
              'text-xs px-2 py-1 rounded-full border font-medium whitespace-nowrap',
              NODE_COLORS[node.status]
            )}>
              {node.label}
              {node.count !== undefined && (
                <span className="ml-1 font-bold">[{node.count}]</span>
              )}
            </span>
            {i < track.nodes.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineSection({ pipelines }: { pipelines: PipelineTrack[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-3">
      <button
        className="flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        Pipeline progress
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="flex flex-col gap-4">
          {pipelines.map(p => <PipelineRow key={p.name} track={p} />)}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineOpen] = useState(true);
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/command-center');
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 2 minutes
    const interval = setInterval(fetchData, 2 * 60 * 1000);

    // Realtime: re-fetch pending count when inbox changes
    const channel = supabase
      .channel('cc_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_inbox' }, fetchData)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-red-600">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">{error ?? 'Failed to load'}</span>
        <button onClick={fetchData} className="ml-2 text-sm underline">Retry</button>
      </div>
    );
  }

  // Signal card colours
  const needsMeColor: SignalColor  = data.pending_approvals === 0 ? 'green' : data.pending_approvals <= 3 ? 'amber' : 'red';
  const agentsColor: SignalColor   = data.agents_active_count >= data.agents_total_count ? 'green'
    : data.agents_active_count >= data.agents_total_count - 2 ? 'amber' : 'red';
  const blockersColor: SignalColor = data.pipeline_blockers === 0 ? 'green' : data.pipeline_blockers === 1 ? 'amber' : 'red';
  const memoryColor: SignalColor   = data.new_memories_7d >= 5 ? 'green' : data.new_memories_7d >= 1 ? 'amber' : 'red';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-xl font-bold">Command Center</h1>
      </div>

      {/* Hero: Autonomy Score */}
      <AutonomyHero data={data} />

      {/* Signal Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SignalCard
          label="Needs Me"
          value={data.pending_approvals}
          subtitle={data.pending_approvals === 0 ? 'All clear' : `${data.pending_approvals} pending approval${data.pending_approvals !== 1 ? 's' : ''}`}
          color={needsMeColor}
        />
        <SignalCard
          label="Agents Active"
          value={`${data.agents_active_count}/${data.agents_total_count}`}
          subtitle="in last 24h"
          color={agentsColor}
        />
        <SignalCard
          label="Pipeline Blockers"
          value={data.pipeline_blockers}
          subtitle={data.pipeline_blockers === 0 ? 'All flowing' : `${data.pipeline_blockers} stage${data.pipeline_blockers !== 1 ? 's' : ''} blocked`}
          color={blockersColor}
        />
        <SignalCard
          label="Learning Rate"
          value={data.new_memories_7d}
          subtitle="new memories this week"
          color={memoryColor}
        />
      </div>

      {/* Activity Feed + Decision Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 border border-border rounded-xl p-4">
          <ActivityFeed items={data.activity_feed} />
        </div>
        <div className="lg:col-span-2 border border-border rounded-xl p-4">
          <DecisionQueue items={data.pending_items} />
        </div>
      </div>

      {/* Agent Grid */}
      <div className="border border-border rounded-xl p-4">
        <AgentGrid vercelAgents={data.vercel_agents} coworkAgents={data.cowork_agents} />
      </div>

      {/* Pipeline Progress */}
      <div className="border border-border rounded-xl p-4">
        <PipelineSection pipelines={data.pipelines} />
      </div>
    </div>
  );
}
