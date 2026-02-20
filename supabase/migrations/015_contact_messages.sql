-- Contact form submissions
create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  email text not null,
  phone text,
  message text not null,
  ip_address text,
  created_at timestamptz default now()
);

alter table contact_messages enable row level security;

-- No public read — admin only via service role
