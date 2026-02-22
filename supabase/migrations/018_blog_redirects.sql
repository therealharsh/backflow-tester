-- Add redirect support for blog post slug changes / merges.
-- Old slugs are stored in redirect_from on the canonical row.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS redirect_from text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_blog_posts_redirect_from_gin
  ON public.blog_posts USING GIN (redirect_from);
