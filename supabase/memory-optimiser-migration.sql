-- ============================================
-- Memory Optimiser Migration
-- Everest Calendar — Agent Memory System
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- AFTER running agents-schema.sql
-- ============================================

-- Add last_optimised_at to agents
-- Tracks when the memory bank was last cleaned up
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS last_optimised_at TIMESTAMPTZ;

-- Add is_archived to agent_memories
-- Soft-delete: archived notes are hidden from the agent's context
-- but preserved in the DB for audit purposes
ALTER TABLE agent_memories
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Index to make filtering active (non-archived) memories fast
CREATE INDEX IF NOT EXISTS idx_agent_memories_active
  ON agent_memories(agent_id, is_archived)
  WHERE is_archived = false;
