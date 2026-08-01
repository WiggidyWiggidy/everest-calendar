-- PREPARED FOR REVIEW — NOT APPLIED
-- Minimum experiment-assignment infrastructure (Phase 12).
-- Reuses existing marketing_experiments; adds only the missing assignment layer.

create table if not exists marketing_experiment_assignments (
  id                    uuid primary key default gen_random_uuid(),
  experiment_id         text not null,
  variant               text not null,
  session_id            text not null,
  anonymous_id          text,                    -- persists assignment across return visits
  eligible_session      boolean not null default true,
  assigned_at           timestamptz not null default now(),
  first_exposure_at     timestamptz,
  landing_page_version  text,
  ad_message_angle      text,
  device_type           text,
  traffic_class         text,
  unique (experiment_id, session_id)
);

create index if not exists idx_mea_experiment      on marketing_experiment_assignments (experiment_id);
create index if not exists idx_mea_anonymous       on marketing_experiment_assignments (anonymous_id);
create index if not exists idx_mea_assigned_at     on marketing_experiment_assignments (assigned_at);

comment on table marketing_experiment_assignments is
  'Experiment assignment at session grain, keyed to anonymous_id so allocation persists '
  'across return visits. Joins to marketing_session_journeys on session_id for outcome '
  'measurement. Primary/guardrail outcomes are computed from that view, not stored here.';

-- Readout join (illustrative, not created):
--   select a.experiment_id, a.variant,
--          count(*) sessions,
--          count(*) filter (where j.added_to_cart) atc,
--          round(100.0*count(*) filter (where j.added_to_cart)/nullif(count(*),0),2) atc_rate
--   from marketing_experiment_assignments a
--   join marketing_session_journeys j using (session_id)
--   where a.experiment_id = $1 and j.reached_product_page
--   group by 1,2;
