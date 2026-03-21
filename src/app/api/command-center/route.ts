// ============================================
// GET /api/command-center
// Aggregates all data for the Command Center page in one request.
// Returns: autonomy score, signal cards, pending items, activity feed,
//          agent grid (Vercel + Cowork), pipeline tracks.
// ============================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  AgentActivityEntry,
  AgentHealthColor,
  AgentHealthStatus,
  AutonomyWeek,
  CoworkAgentHealth,
  CommandCenterData,
  PipelineNode,
  PipelineTrack,
  PlatformInboxItem,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function healthColor(lastRunAt: string | null, lastStatus: string | null): AgentHealthColor {
  if (!lastRunAt) return 'red';
  const ageMs = Date.now() - new Date(lastRunAt).getTime();
  const ageH  = ageMs / (1000 * 60 * 60);
  if (lastStatus === 'error') return ageH < 2 ? 'amber' : 'red';
  if (ageH < 2) return 'green';
  if (ageH < 6) return 'amber';
  return 'red';
}

function coworkHealth(lastActiveAt: string | null): AgentHealthColor {
  if (!lastActiveAt) return 'red';
  const ageH = (Date.now() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60);
  if (ageH < 24) return 'green';
  if (ageH < 48) return 'amber';
  return 'red';
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

function pipelineNodeStatus(s: string): PipelineNode['status'] {
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'blocked') return 'blocked';
  return 'not_started';
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const uid = user.id;
  const now = new Date();
  const ago7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  // ── Parallel fetches ───────────────────────────────────────────────────────
  const [
    pendingRes,
    taskRunsRes,
    agentsRes,
    memoriesRes,
    activityRes,
    workflowRes,
    candidatesRes,
    inboxManualRes,
  ] = await Promise.all([
    // Pending inbox items (decision queue)
    supabase.from('platform_inbox')
      .select('*').eq('user_id', uid).eq('status', 'pending')
      .order('approval_tier', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),

    // Latest task_run per Vercel agent (last 7 days for autonomy, last 48h for feed)
    supabase.from('task_runs')
      .select('*').eq('user_id', uid)
      .order('started_at', { ascending: false })
      .limit(50),

    // All Cowork agents
    supabase.from('agents').select('id, name, updated_at').eq('user_id', uid),

    // Agent memories (7d for new count, all for per-agent count + latest title)
    supabase.from('agent_memories')
      .select('id, agent_id, title, created_at').eq('user_id', uid).eq('is_archived', false)
      .order('created_at', { ascending: false }),

    // Activity log (last 48h)
    supabase.from('agent_activity_log')
      .select('*').eq('user_id', uid)
      .gte('created_at', ago48h)
      .order('created_at', { ascending: false })
      .limit(50),

    // Workflow stages
    supabase.from('workflow_stages')
      .select('workstream, stage_name, stage_order, status').eq('user_id', uid)
      .order('workstream').order('stage_order'),

    // Hiring pipeline counts
    supabase.from('upwork_candidates')
      .select('screening_status').eq('user_id', uid),

    // Manual inbox interventions in last 7d (for autonomy calc)
    supabase.from('platform_inbox')
      .select('id').eq('user_id', uid)
      .in('status', ['approved', 'edited', 'rejected'])
      .gte('updated_at', ago7d),
  ]);

  // ── Signal cards ───────────────────────────────────────────────────────────
  const pendingItems = (pendingRes.data ?? []) as PlatformInboxItem[];
  const pendingCount = pendingItems.length;

  const allTaskRuns = taskRunsRes.data ?? [];
  const memories    = memoriesRes.data ?? [];
  const newMemories7d = memories.filter(m => m.created_at >= ago7d).length;
  const blockers = (workflowRes.data ?? []).filter(s => s.status === 'blocked').length;

  // ── Vercel agent grid ──────────────────────────────────────────────────────
  const VERCEL_AGENT_LABELS: Record<string, string> = {
    'upwork-candidate-response-check': 'Upwork Monitor',
    'alibaba-supplier-monitor':        'Alibaba Monitor',
    'orchestrator-directive-processor':'Orchestrator',
    'upwork-monitor':                  'Upwork Monitor',
    'alibaba-monitor':                 'Alibaba Monitor',
  };

  // Deduplicate: latest run per agent
  const latestPerAgent = new Map<string, typeof allTaskRuns[0]>();
  for (const run of allTaskRuns) {
    if (!latestPerAgent.has(run.agent_name)) latestPerAgent.set(run.agent_name, run);
  }

  const vercelAgents: AgentHealthStatus[] = Array.from(latestPerAgent.values()).map(run => ({
    agent_name:      VERCEL_AGENT_LABELS[run.agent_name] ?? run.agent_name,
    last_status:     run.status,
    last_run_at:     run.started_at,
    items_processed: run.items_processed ?? 0,
    error_message:   run.error_message ?? null,
    health:          healthColor(run.started_at, run.status),
  }));

  // ── Cowork agent grid ──────────────────────────────────────────────────────
  const agentList = agentsRes.data ?? [];

  const memsByAgent = new Map<string, { count: number; latest: string | null; latestTitle: string | null }>();
  for (const m of memories) {
    const existing = memsByAgent.get(m.agent_id) ?? { count: 0, latest: null, latestTitle: null };
    existing.count++;
    if (!existing.latest || m.created_at > existing.latest) {
      existing.latest = m.created_at;
      existing.latestTitle = m.title;
    }
    memsByAgent.set(m.agent_id, existing);
  }

  const coworkAgents: CoworkAgentHealth[] = agentList.map(agent => {
    const mems = memsByAgent.get(agent.id);
    // Use latest memory time as "last active" for cowork agents
    const lastActive = mems?.latest ?? null;
    return {
      id:                  agent.id,
      name:                agent.name,
      memory_count:        mems?.count ?? 0,
      latest_memory_title: mems?.latestTitle ?? null,
      last_active_at:      lastActive,
      health:              coworkHealth(lastActive),
    };
  });

  // ── Active agent count (combined) ─────────────────────────────────────────
  const vercelActive24h = new Set(
    allTaskRuns.filter(r => r.started_at >= ago24h).map(r => r.agent_name)
  ).size;
  const coworkActive24h = coworkAgents.filter(a => a.last_active_at && a.last_active_at >= ago24h).length;
  const agentsActiveCount = vercelActive24h + coworkActive24h;
  const agentsTotalCount  = latestPerAgent.size + agentList.length;

  // ── Autonomy score ─────────────────────────────────────────────────────────
  const autoActions7d   = allTaskRuns.filter(r => r.started_at >= ago7d && r.status === 'success').length;
  const manualActions7d = (inboxManualRes.data ?? []).length;
  const total7d         = autoActions7d + manualActions7d;
  const autonomyRate    = total7d === 0 ? 0 : Math.round((autoActions7d / total7d) * 100);

  // 4-week trend (compute buckets)
  const autonomyTrend: AutonomyWeek[] = [];
  for (let w = 3; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd   = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const ws = weekStart.toISOString();
    const we = weekEnd.toISOString();
    const weekAuto   = allTaskRuns.filter(r => r.started_at >= ws && r.started_at < we && r.status === 'success').length;
    // We don't have historical inbox data bucketed — approximate as 0 for old weeks
    const weekManual = w === 0 ? manualActions7d : 0;
    const weekTotal  = weekAuto + weekManual;
    autonomyTrend.push({
      week_label:     weekLabel(weekStart),
      auto_actions:   weekAuto,
      manual_actions: weekManual,
      rate:           weekTotal === 0 ? 0 : Math.round((weekAuto / weekTotal) * 100),
    });
  }

  // ── Activity feed (merge task_runs + agent_activity_log) ──────────────────
  const taskRunFeedItems: AgentActivityEntry[] = allTaskRuns
    .filter(r => r.started_at >= ago48h)
    .map(r => ({
      id:            r.id,
      agent_name:    VERCEL_AGENT_LABELS[r.agent_name] ?? r.agent_name,
      agent_source:  'vercel' as const,
      activity_type: (r.status === 'success' ? 'auto_action' : r.status === 'error' ? 'error' : 'info') as AgentActivityEntry['activity_type'],
      description:   r.status === 'success'
        ? `Ran successfully — ${r.items_processed ?? 0} item${r.items_processed === 1 ? '' : 's'} processed`
        : r.status === 'error'
        ? `Failed: ${r.error_message ?? 'unknown error'}`
        : 'Run in progress',
      domain:        null,
      metadata:      (r.metadata as Record<string, unknown>) ?? {},
      created_at:    r.started_at,
    }));

  const logFeedItems = (activityRes.data ?? []) as AgentActivityEntry[];

  const activityFeed = [...taskRunFeedItems, ...logFeedItems]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);

  // ── Pipeline tracks ────────────────────────────────────────────────────────
  const stages = workflowRes.data ?? [];

  const workstreams: Record<string, { label: string; stages: typeof stages }> = {
    cad_design:             { label: 'Product / CAD', stages: [] },
    engineer_hiring:        { label: 'Engineer Hiring', stages: [] },
    manufacturer_outreach:  { label: 'Manufacturer Outreach', stages: [] },
  };
  for (const s of stages) {
    if (workstreams[s.workstream]) workstreams[s.workstream].stages.push(s);
  }

  const pipelines: PipelineTrack[] = [];

  // Hiring pipeline from upwork_candidates
  const candidateRows = candidatesRes.data ?? [];
  const hiringCounts: Record<string, number> = {};
  for (const c of candidateRows) {
    hiringCounts[c.screening_status] = (hiringCounts[c.screening_status] ?? 0) + 1;
  }
  pipelines.push({
    name: 'Hiring',
    nodes: [
      { label: 'Not Sent',     status: 'not_started', count: hiringCounts['not_sent']         ?? 0 },
      { label: 'Pending',      status: (hiringCounts['pending_approval'] ?? 0) > 0 ? 'in_progress' : 'not_started', count: hiringCounts['pending_approval'] ?? 0 },
      { label: 'Screened',     status: (hiringCounts['screened'] ?? 0) > 0 ? 'in_progress' : 'not_started', count: hiringCounts['screened'] ?? 0 },
      { label: 'Pilot Ready',  status: (hiringCounts['pilot_ready'] ?? 0) > 0 ? 'in_progress' : 'not_started', count: hiringCounts['pilot_ready'] ?? 0 },
      { label: 'Hired',        status: (hiringCounts['hired'] ?? 0) > 0 ? 'done' : 'not_started', count: hiringCounts['hired'] ?? 0 },
    ],
  });

  for (const [, ws] of Object.entries(workstreams)) {
    if (!ws.stages.length) continue;
    pipelines.push({
      name: ws.label,
      nodes: ws.stages.map(s => ({
        label:  s.stage_name,
        status: pipelineNodeStatus(s.status),
      })),
    });
  }

  // ── Response ───────────────────────────────────────────────────────────────
  const data: CommandCenterData = {
    pending_approvals:   pendingCount,
    agents_active_count: agentsActiveCount,
    agents_total_count:  agentsTotalCount,
    pipeline_blockers:   blockers,
    new_memories_7d:     newMemories7d,
    auto_actions_7d:     autoActions7d,
    manual_actions_7d:   manualActions7d,
    autonomy_rate:       autonomyRate,
    autonomy_trend:      autonomyTrend,
    pending_items:       pendingItems,
    activity_feed:       activityFeed,
    vercel_agents:       vercelAgents,
    cowork_agents:       coworkAgents,
    pipelines,
  };

  return NextResponse.json(data);
}
