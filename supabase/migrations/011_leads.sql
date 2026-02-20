-- Leads table for quote requests
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  provider_id text,
  provider_slug text,
  provider_name text,
  first_name text not null,
  last_name text,
  email text not null,
  phone text,
  address text,
  notes text,
  source text not null default 'provider_page',
  page_url text,
  ip_address text,
  created_at timestamptz not null default now()
);

-- Index for admin queries
create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_provider_id on public.leads (provider_id);

-- RLS: only service role can insert/read
alter table public.leads enable row level security;

-- Allow anon to insert (the API route runs server-side but uses anon key sometimes)
create policy "Allow insert from API" on public.leads
  for insert to anon, authenticated
  with check (true);

-- Only authenticated (admin) can read
create policy "Admin read leads" on public.leads
  for select to authenticated
  using (true);
