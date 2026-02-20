-- Lead funnel events for server-side audit trail
create table if not exists public.lead_events (
  id bigint generated always as identity primary key,
  event text not null,
  provider_id text,
  provider_name text,
  page_url text,
  referrer text,
  ip_address text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Index for admin queries
create index if not exists idx_lead_events_created_at on public.lead_events (created_at desc);
create index if not exists idx_lead_events_event on public.lead_events (event);
create index if not exists idx_lead_events_provider_id on public.lead_events (provider_id);

-- RLS
alter table public.lead_events enable row level security;

-- Allow anon to insert (API routes use anon key)
create policy "Allow insert from API" on public.lead_events
  for insert to anon, authenticated
  with check (true);

-- Only authenticated (admin) can read
create policy "Admin read lead_events" on public.lead_events
  for select to authenticated
  using (true);
