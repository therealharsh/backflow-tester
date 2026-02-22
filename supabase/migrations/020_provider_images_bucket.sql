-- 020: Storage bucket for provider images (cover, gallery uploads by owners)

insert into storage.buckets (id, name, public)
values ('provider-images', 'provider-images', true)
on conflict (id) do nothing;

-- Public read access
create policy "Public read access for provider images"
  on storage.objects for select
  using (bucket_id = 'provider-images');

-- Service role can upload/delete (owner uploads go through API routes)
create policy "Service role manages provider images"
  on storage.objects for all
  to service_role
  using (bucket_id = 'provider-images')
  with check (bucket_id = 'provider-images');
