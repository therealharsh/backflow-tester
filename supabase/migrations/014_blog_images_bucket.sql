-- Create public storage bucket for blog images
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true);

-- Allow public read access to all files in blog-images
create policy "Public read access for blog images"
  on storage.objects for select
  using (bucket_id = 'blog-images');
