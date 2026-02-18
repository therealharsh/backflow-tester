-- Blog posts table for the Supabase-native CMS
create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  content text not null default '',
  cover_image_url text,
  tags text[] default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_blog_posts_slug on blog_posts(slug);
create index idx_blog_posts_status on blog_posts(status);
create index idx_blog_posts_published_at on blog_posts(published_at desc);

-- RLS: public reads published posts via anon key; service role bypasses for admin
alter table blog_posts enable row level security;

create policy "Public can read published posts"
  on blog_posts for select
  using (status = 'published');
