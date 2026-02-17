-- ============================================================
-- Migration 001: Create core tables
-- ============================================================

-- Providers: one row per backflow-verified business
create table if not exists providers (
  place_id          text primary key,
  google_id         text,
  name              text not null,
  phone             text,
  website           text,
  address           text,
  city              text,
  city_slug         text,
  state_code        text,
  postal_code       text,
  latitude          double precision,
  longitude         double precision,
  type              text,
  subtypes          text,
  category          text,
  rating            double precision,
  reviews           integer   default 0,
  backflow_score    integer   default 0,
  tier              text,            -- 'testing' | 'service' | null
  best_evidence_url text,
  location_link     text,
  reviews_link      text,
  image_urls        jsonb     default '[]'::jsonb,
  provider_slug     text unique not null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Cities: aggregated city view for SEO hub pages
create table if not exists cities (
  id             bigserial primary key,
  city           text not null,
  city_slug      text not null,
  state_code     text not null,
  provider_count integer default 0,
  latitude       double precision,
  longitude      double precision,
  created_at     timestamptz default now(),
  unique (city_slug, state_code)
);

-- Auto-update updated_at on providers
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger providers_updated_at
  before update on providers
  for each row execute function set_updated_at();

-- ── Row Level Security (required for anon key reads) ──────────────────────────
alter table providers enable row level security;
alter table cities    enable row level security;

-- Public read access (directory is public)
create policy "Public read providers"
  on providers for select to anon using (true);

create policy "Public read cities"
  on cities for select to anon using (true);

-- Service role has full access (for loader script)
create policy "Service role full access providers"
  on providers for all to service_role using (true);

create policy "Service role full access cities"
  on cities for all to service_role using (true);
