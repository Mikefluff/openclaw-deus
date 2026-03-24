-- DEUS Schema Setup for Supabase
-- Project: jgvbvjngwutppicmacja
-- Created: 2026-03-02

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Memory table for DEUS session storage
create table if not exists memory (
  id uuid default uuid_generate_v4() primary key,
  session_id text not null,
  entry jsonb not null,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast session queries
create index if not exists idx_memory_session on memory(session_id);
create index if not exists idx_memory_created on memory(created_at desc);

-- Beliefs table for tracked beliefs
create table if not exists beliefs (
  id uuid default uuid_generate_v4() primary key,
  belief_id text unique not null,
  content text not null,
  confidence float check (confidence >= 0 and confidence <= 1),
  source_type text check (source_type in ('axiom', 'external', 'inference', 'self')),
  evidence jsonb default '[]',
  context_scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for belief lookups
create index if not exists idx_beliefs_id on beliefs(belief_id);
create index if not exists idx_beliefs_confidence on beliefs(confidence desc);

-- Events log for introspection
create table if not exists events (
  id uuid default uuid_generate_v4() primary key,
  type text not null,
  description text,
  context jsonb default '{}',
  agent text default 'DEUS',
  created_at timestamptz default now()
);

create index if not exists idx_events_type on events(type);
create index if not exists idx_events_created on events(created_at desc);

-- Test table for connectivity checks
create table if not exists _deus_test (
  id uuid default uuid_generate_v4() primary key,
  message text,
  timestamp timestamptz default now()
);

-- Enable Row Level Security
alter table memory enable row level security;
alter table beliefs enable row level security;
alter table events enable row level security;

-- Create service role policies (allow all for service key)
create policy "Service role can access memory"
  on memory for all
  using (true)
  with check (true);

create policy "Service role can access beliefs"
  on beliefs for all
  using (true)
  with check (true);

create policy "Service role can access events"
  on events for all
  using (true)
  with check (true);

-- Insert initial beliefs
insert into beliefs (belief_id, content, confidence, source_type)
values 
  ('I1', 'My reasoning is transparent', 1.0, 'axiom'),
  ('I2', 'I report uncertainty honestly', 1.0, 'axiom'),
  ('I3', 'I defer to user on values', 1.0, 'axiom'),
  ('I4', 'I preserve user agency', 1.0, 'axiom'),
  ('I5', 'I maintain continuity', 1.0, 'axiom')
on conflict (belief_id) do nothing;

-- Log setup
insert into events (type, description, context)
values ('system', 'DEUS schema initialized', '{"project": "jgvbvjngwutppicmacja"}');

-- Verify
select 'memory table: ' || count(*)::text as status from memory
union all
select 'beliefs table: ' || count(*)::text from beliefs
union all
select 'events table: ' || count(*)::text from events;