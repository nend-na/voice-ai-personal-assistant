-- ============================================================================
-- Voice AI Personal Assistant — Database Schema
-- Postgres / Supabase
--
-- Design principles:
--  1. Workflows are DATA, not code. New business types = new rows, not new
--     branches in application logic.
--  2. `condition_definition` and `validation_rules` are JSONB because rule
--     shapes genuinely vary (a rule engine over a fixed relational schema
--     would be more rigid, not less, for this problem). Everything else is
--     normalized columns — JSONB is the exception, not the default.
--  3. Every table that belongs to a business is scoped by business_id (either
--     directly or transitively) so RLS can be expressed simply.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  business_type       text not null,              -- 'cake_shop' | 'clinic' | 'delivery' | 'real_estate' | 'repair' | custom
  phone_number        text,
  default_language    text not null default 'en',  -- ISO 639-1: 'en' | 'hi'
  timezone            text not null default 'Asia/Kolkata',
  is_demo             boolean not null default false, -- distinguishes seeded demo data from real data
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- google_calendar_connections
-- One OAuth connection per business. Tokens are encrypted at the application
-- layer before insert (see lib/ai/tools/calendar-oauth.ts) — never stored
-- plaintext, never sent to the client.
-- ---------------------------------------------------------------------------
create table if not exists google_calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  google_account_email  text not null,
  calendar_id           text not null default 'primary',
  access_token_enc      text not null,
  refresh_token_enc     text not null,
  token_expiry          timestamptz not null,
  scope                 text not null,
  connected_at          timestamptz not null default now(),
  revoked_at            timestamptz,
  unique (business_id)
);

-- ---------------------------------------------------------------------------
-- workflows
-- ---------------------------------------------------------------------------
create table if not exists workflows (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  trigger           text not null default 'missed_call', -- extensible: 'missed_call' | 'manual' | 'sms_inbound' (future)
  greeting          text not null,
  assistant_role    text not null,      -- e.g. "You are the front-desk assistant for a bakery."
  tone              text not null default 'friendly_professional',
  restrictions      text,               -- e.g. "Never give medical advice."
  closing_message   text not null,
  language           text not null default 'en',
  status            text not null default 'draft', -- 'draft' | 'active' | 'archived'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workflow_intents
-- A workflow can branch into multiple intents (order_cake vs general_enquiry).
-- Each intent has its own field set, since a cake order and a general
-- enquiry don't collect the same information.
-- ---------------------------------------------------------------------------
create table if not exists workflow_intents (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid not null references workflows(id) on delete cascade,
  intent_key      text not null,        -- 'order_cake' | 'book_appointment' | ...
  label           text not null,        -- human-readable, shown in builder UI
  description     text,                 -- helps the LLM classify intent correctly
  display_order   int not null default 0,
  unique (workflow_id, intent_key)
);

-- ---------------------------------------------------------------------------
-- workflow_fields
-- ---------------------------------------------------------------------------
create table if not exists workflow_fields (
  id                uuid primary key default gen_random_uuid(),
  workflow_intent_id uuid not null references workflow_intents(id) on delete cascade,
  field_name        text not null,     -- snake_case, used as the JSON key by the extractor
  label             text not null,     -- shown to the business owner
  field_type        text not null,     -- 'text' | 'number' | 'date' | 'time' | 'phone' | 'select' | 'address'
  description       text,              -- guidance the LLM uses to know what/how to ask
  required          boolean not null default false,
  select_options    jsonb,             -- ["chocolate","vanilla",...] when field_type = 'select'
  validation_rules  jsonb,             -- { "min": 0, "max": 10000 } etc — shape depends on field_type
  display_order     int not null default 0,
  unique (workflow_intent_id, field_name)
);

-- ---------------------------------------------------------------------------
-- workflow_conditions
-- Simple, composable rules evaluated after each field update.
-- condition_definition example:
--   { "field": "required_date", "op": "within_hours", "value": 24 }
--   { "field": "budget", "op": "gt", "value": 5000 }
-- resulting_action example:
--   { "type": "set_priority", "value": "urgent" }
-- ---------------------------------------------------------------------------
create table if not exists workflow_conditions (
  id                  uuid primary key default gen_random_uuid(),
  workflow_intent_id  uuid not null references workflow_intents(id) on delete cascade,
  condition_definition jsonb not null,
  resulting_action    jsonb not null,
  priority            int not null default 0,   -- lower evaluates first; first match per action-type wins
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workflow_actions
-- What should fire when the conversation completes (or a condition matches).
-- ---------------------------------------------------------------------------
create table if not exists workflow_actions (
  id                  uuid primary key default gen_random_uuid(),
  workflow_intent_id  uuid not null references workflow_intents(id) on delete cascade,
  action_type         text not null,  -- 'create_enquiry' | 'create_followup' | 'notify_owner' | 'create_calendar_event' | 'mark_urgent'
  config              jsonb,          -- action-specific config, e.g. notify channel
  trigger_on          text not null default 'completion' -- 'completion' | 'condition_match'
);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  workflow_id       uuid not null references workflows(id) on delete cascade,
  workflow_intent_id uuid references workflow_intents(id),   -- set once the AI classifies intent
  mode              text not null default 'simulated',       -- 'simulated' | 'live_voice' | 'live_text'
  customer_name     text,
  customer_phone    text,
  language          text not null default 'en',
  status            text not null default 'in_progress',     -- 'in_progress' | 'completed' | 'abandoned' | 'failed'
  priority          text not null default 'normal',          -- 'normal' | 'urgent'
  summary           text,             -- AI-generated after completion
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  is_demo           boolean not null default false
);

-- ---------------------------------------------------------------------------
-- messages
-- Full transcript, one row per turn. (Superset of a flat "transcript" text
-- column — normalized so the UI can render role-based chat bubbles and so
-- tool_calls are queryable/auditable rather than buried in a blob.)
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  role              text not null,     -- 'customer' | 'assistant' | 'system' | 'tool'
  content           text not null,
  tool_name         text,              -- populated when role = 'tool'
  tool_call_id      text,
  created_at        timestamptz not null default now(),
  sequence          int not null
);

-- ---------------------------------------------------------------------------
-- collected_data
-- ---------------------------------------------------------------------------
create table if not exists collected_data (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  field_name        text not null,
  field_value       text not null,
  confidence        numeric(3,2),      -- 0.00–1.00, from structured extraction
  updated_at        timestamptz not null default now(),
  unique (conversation_id, field_name)
);

-- ---------------------------------------------------------------------------
-- actions
-- Record of what the workflow actually did (or attempted) for a conversation.
-- ---------------------------------------------------------------------------
create table if not exists actions (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  action_type       text not null,     -- mirrors workflow_actions.action_type
  status            text not null default 'pending', -- 'pending' | 'success' | 'failed'
  metadata          jsonb,             -- e.g. { "calendar_event_id": "...", "start": "..." }
  error_message     text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------------
create table if not exists follow_ups (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  status            text not null default 'open',   -- 'open' | 'contacted' | 'completed' | 'closed'
  priority          text not null default 'normal', -- 'normal' | 'urgent'
  assigned_to       text,
  scheduled_at      timestamptz,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_workflows_business on workflows(business_id);
create index if not exists idx_intents_workflow on workflow_intents(workflow_id);
create index if not exists idx_fields_intent on workflow_fields(workflow_intent_id);
create index if not exists idx_conditions_intent on workflow_conditions(workflow_intent_id);
create index if not exists idx_actions_def_intent on workflow_actions(workflow_intent_id);
create index if not exists idx_conversations_business on conversations(business_id);
create index if not exists idx_conversations_workflow on conversations(workflow_id);
create index if not exists idx_messages_conversation on messages(conversation_id, sequence);
create index if not exists idx_collected_data_conversation on collected_data(conversation_id);
create index if not exists idx_actions_conversation on actions(conversation_id);
create index if not exists idx_followups_conversation on follow_ups(conversation_id);
create index if not exists idx_followups_status on follow_ups(status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Every business-owned row is only visible/writable by its owning user.
-- Service-role key (used by server-side API routes / AI orchestrator) bypasses
-- RLS by design — the app layer is the trust boundary for AI-written data,
-- per the "AI never writes directly to the DB" rule in the orchestrator.
-- ---------------------------------------------------------------------------
alter table businesses enable row level security;
alter table google_calendar_connections enable row level security;
alter table workflows enable row level security;
alter table workflow_intents enable row level security;
alter table workflow_fields enable row level security;
alter table workflow_conditions enable row level security;
alter table workflow_actions enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table collected_data enable row level security;
alter table actions enable row level security;
alter table follow_ups enable row level security;

create policy "owner_full_access_businesses" on businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner_access_calendar" on google_calendar_connections
  for all using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "owner_access_workflows" on workflows
  for all using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "owner_access_intents" on workflow_intents
  for all using (workflow_id in (
    select w.id from workflows w join businesses b on b.id = w.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_fields" on workflow_fields
  for all using (workflow_intent_id in (
    select wi.id from workflow_intents wi
    join workflows w on w.id = wi.workflow_id
    join businesses b on b.id = w.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_conditions" on workflow_conditions
  for all using (workflow_intent_id in (
    select wi.id from workflow_intents wi
    join workflows w on w.id = wi.workflow_id
    join businesses b on b.id = w.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_actions_def" on workflow_actions
  for all using (workflow_intent_id in (
    select wi.id from workflow_intents wi
    join workflows w on w.id = wi.workflow_id
    join businesses b on b.id = w.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_conversations" on conversations
  for all using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "owner_access_messages" on messages
  for all using (conversation_id in (
    select c.id from conversations c join businesses b on b.id = c.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_collected_data" on collected_data
  for all using (conversation_id in (
    select c.id from conversations c join businesses b on b.id = c.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_actions" on actions
  for all using (conversation_id in (
    select c.id from conversations c join businesses b on b.id = c.business_id where b.owner_id = auth.uid()
  ));

create policy "owner_access_followups" on follow_ups
  for all using (conversation_id in (
    select c.id from conversations c join businesses b on b.id = c.business_id where b.owner_id = auth.uid()
  ));
