-- ============================================
-- Supplier Conversations — Negotiation Tracking
-- Tracks negotiation state per supplier per component.
-- Both Chrome active mode and email pipeline write here.
-- ============================================

CREATE TABLE IF NOT EXISTS supplier_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_key TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  component_id UUID REFERENCES components(id) ON DELETE SET NULL,
  component_name TEXT NOT NULL,
  negotiation_phase TEXT DEFAULT 'quote_collection'
    CHECK (negotiation_phase IN (
      'discovery', 'quote_collection', 'counter_offer',
      'sample', 'factory_visit', 'production_terms',
      'closed_won', 'closed_lost'
    )),
  target_price_usd NUMERIC(10,2),
  current_quote_usd NUMERIC(10,2),
  first_quote_usd NUMERIC(10,2),
  quote_count INT DEFAULT 0,
  messages JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'won', 'lost', 'abandoned')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sc_supplier ON supplier_conversations(supplier_key);
CREATE INDEX IF NOT EXISTS idx_sc_component ON supplier_conversations(component_id);
CREATE INDEX IF NOT EXISTS idx_sc_phase ON supplier_conversations(negotiation_phase);
CREATE INDEX IF NOT EXISTS idx_sc_status ON supplier_conversations(status);

-- Enable RLS
ALTER TABLE supplier_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own supplier conversations"
  ON supplier_conversations FOR ALL
  USING (true);

-- ============================================
-- RPC: get_supplier_pipeline
-- Returns all active negotiations grouped by supplier
-- ============================================
CREATE OR REPLACE FUNCTION get_supplier_pipeline()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(supplier_group ORDER BY supplier_group->>'supplier_name')
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'supplier_key', supplier_key,
      'supplier_name', supplier_name,
      'conversations', jsonb_agg(
        jsonb_build_object(
          'id', id,
          'component_name', component_name,
          'negotiation_phase', negotiation_phase,
          'target_price_usd', target_price_usd,
          'current_quote_usd', current_quote_usd,
          'first_quote_usd', first_quote_usd,
          'quote_count', quote_count,
          'status', status,
          'message_count', jsonb_array_length(messages),
          'updated_at', updated_at
        ) ORDER BY updated_at DESC
      )
    ) AS supplier_group
    FROM supplier_conversations
    WHERE status = 'active'
    GROUP BY supplier_key, supplier_name
  ) sub;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ============================================
-- RPC: get_conversation_thread
-- Full message history for one negotiation
-- ============================================
CREATE OR REPLACE FUNCTION get_conversation_thread(
  p_supplier_key TEXT,
  p_component_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'component_name', component_name,
      'negotiation_phase', negotiation_phase,
      'target_price_usd', target_price_usd,
      'current_quote_usd', current_quote_usd,
      'first_quote_usd', first_quote_usd,
      'quote_count', quote_count,
      'status', status,
      'notes', notes,
      'messages', messages,
      'created_at', created_at,
      'updated_at', updated_at
    )
  )
  INTO result
  FROM supplier_conversations
  WHERE supplier_key = p_supplier_key
    AND (p_component_name IS NULL OR component_name ILIKE '%' || p_component_name || '%');

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ============================================
-- RPC: get_supplier_comparison
-- All suppliers who quoted on a component
-- ============================================
CREATE OR REPLACE FUNCTION get_supplier_comparison(
  p_component_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'supplier_key', supplier_key,
      'supplier_name', supplier_name,
      'negotiation_phase', negotiation_phase,
      'current_quote_usd', current_quote_usd,
      'first_quote_usd', first_quote_usd,
      'target_price_usd', target_price_usd,
      'quote_count', quote_count,
      'status', status,
      'updated_at', updated_at
    )
    ORDER BY current_quote_usd ASC NULLS LAST
  )
  INTO result
  FROM supplier_conversations
  WHERE component_name ILIKE '%' || p_component_name || '%'
    AND status = 'active';

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ============================================
-- RPC: log_supplier_message
-- Appends a message to the conversation thread
-- ============================================
CREATE OR REPLACE FUNCTION log_supplier_message(
  p_supplier_key TEXT,
  p_component_name TEXT,
  p_direction TEXT,
  p_content TEXT,
  p_channel TEXT DEFAULT 'alibaba',
  p_reasoning TEXT DEFAULT NULL,
  p_quote_usd NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  conv_id UUID;
  new_msg JSONB;
  result JSONB;
BEGIN
  -- Find or create conversation
  SELECT id INTO conv_id
  FROM supplier_conversations
  WHERE supplier_key = p_supplier_key
    AND component_name = p_component_name
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO supplier_conversations (supplier_key, supplier_name, component_name)
    VALUES (p_supplier_key, p_supplier_key, p_component_name)
    RETURNING id INTO conv_id;
  END IF;

  -- Build message object
  new_msg := jsonb_build_object(
    'ts', now(),
    'direction', p_direction,
    'content', p_content,
    'channel', p_channel,
    'reasoning', p_reasoning
  );

  -- Append message and update quote if provided
  UPDATE supplier_conversations
  SET
    messages = messages || jsonb_build_array(new_msg),
    current_quote_usd = COALESCE(p_quote_usd, current_quote_usd),
    first_quote_usd = CASE
      WHEN first_quote_usd IS NULL AND p_quote_usd IS NOT NULL THEN p_quote_usd
      ELSE first_quote_usd
    END,
    quote_count = CASE
      WHEN p_quote_usd IS NOT NULL THEN quote_count + 1
      ELSE quote_count
    END,
    updated_at = now()
  WHERE id = conv_id
  RETURNING jsonb_build_object(
    'conversation_id', id,
    'message_count', jsonb_array_length(messages),
    'current_quote_usd', current_quote_usd
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================
-- RPC: get_negotiation_context
-- Returns enriched negotiation context for inbox items
-- Called by the inbox API to populate supplier cards
-- ============================================
CREATE OR REPLACE FUNCTION get_negotiation_context(p_contact_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'component_name', component_name,
      'negotiation_phase', negotiation_phase,
      'target_price_usd', target_price_usd,
      'current_quote_usd', current_quote_usd,
      'first_quote_usd', first_quote_usd,
      'quote_count', quote_count,
      'status', status,
      'message_count', jsonb_array_length(messages)
    )
  )
  INTO result
  FROM supplier_conversations
  WHERE supplier_name ILIKE '%' || p_contact_name || '%'
     OR supplier_key ILIKE '%' || split_part(lower(p_contact_name), ' ', 1) || '%';

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
