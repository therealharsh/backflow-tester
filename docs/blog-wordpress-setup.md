# WordPress Headless CMS Setup for FindBackflowTesters.com Blog

This guide walks you through creating a WordPress instance that serves as a **headless CMS** for the blog at `findbackflowtesters.com/blog`. WordPress handles content authoring only — all public pages are rendered by Next.js.

---

## 1. Hosting Options

### Option A: Managed WordPress Host (Recommended)

**SiteGround / Bluehost / Hostinger**

| | Details |
|---|---|
| Cost | $3–10/mo |
| Setup | 1-click WordPress install |
| Pros | Cheap, automatic updates, backups, SSL included |
| Cons | Shared hosting (fine since WP serves no public traffic) |

Best pick: **Hostinger WordPress Starter** (~$3/mo) or **SiteGround StartUp** (~$4/mo).

### Option B: VPS with 1-Click WordPress

**DigitalOcean / Vultr / Hetzner**

| | Details |
|---|---|
| Cost | $5–6/mo |
| Setup | 1-click WordPress droplet/app |
| Pros | Full control, private IP, can restrict access |
| Cons | You manage updates/backups yourself |

Best pick: **DigitalOcean WordPress 1-Click** ($6/mo droplet).

### Option C: WordPress.com Business

| | Details |
|---|---|
| Cost | $25/mo |
| Setup | Fully managed, create site in 2 min |
| Pros | Zero maintenance, automatic updates, plugin support |
| Cons | Most expensive option for a headless CMS |

---

## 2. Step-by-Step Setup

### 2.1 Create the WordPress Site

1. Sign up with your chosen host.
2. Install WordPress (most hosts have 1-click install).
3. Set your WordPress URL. Two options:
   - **Subdomain (recommended):** `cms.findbackflowtesters.com`
   - **Host default URL:** e.g., `your-site.hostinger.io` (simpler, no DNS needed)

   > If using a subdomain, add a DNS A/CNAME record pointing `cms.findbackflowtesters.com` to your host's IP.

4. Complete the WordPress setup wizard (site title, admin user, etc.).

### 2.2 Configure WordPress Settings

Log into **WP Admin** (`https://YOUR_WP_HOST/wp-admin`):

1. **Settings > Permalinks**
   - Select **"Post name"** (`/%postname%/`)
   - Save Changes

2. **Settings > Reading**
   - Check **"Discourage search engines from indexing this site"**
   - Save Changes

3. **Settings > General**
   - Confirm Site URL is correct

### 2.3 Install Required Plugins

Go to **Plugins > Add New** and install + activate:

1. **WPGraphQL** (required)
   - Search "WPGraphQL" by Jason Bahl
   - Install & Activate
   - Verify: visit `https://YOUR_WP_HOST/graphql` — you should see a JSON response

2. **WPGraphQL for Yoast SEO** (optional, recommended)
   - First install **Yoast SEO** plugin
   - Then install **WPGraphQL for Yoast SEO** (adds `seo` field to GraphQL)
   - Both install & activate

### 2.4 Create a Test Post

1. Go to **Posts > Add New**
2. Write a test post:
   - **Title:** "Understanding Backflow Testing Requirements"
   - **Excerpt:** Fill in a short summary (2-3 sentences)
   - **Content:** Write some paragraphs with headings (H2, H3)
   - **Featured Image:** Upload a relevant photo
   - **Categories:** Create "Guides" category and assign it
   - **Tags:** Add "backflow testing", "RPZ"
3. **Publish** the post.

### 2.5 Verify GraphQL Endpoint

Open your browser or a tool like Postman:

```
POST https://YOUR_WP_HOST/graphql
Content-Type: application/json

{
  "query": "{ posts { nodes { title slug date } } }"
}
```

You should get a JSON response with your test post. This URL is your `WORDPRESS_GRAPHQL_URL`.

---

## 3. Prevent WordPress from Being Indexed

WordPress must NOT appear in search results — only the Next.js site should be indexed.

### 3.1 WordPress Setting (already done above)
- **Settings > Reading > "Discourage search engines"** — checked.

### 3.2 Yoast SEO (if installed)
- **Yoast SEO > Search Appearance > General**
- Ensure the site is NOT set to be visible to search engines.

### 3.3 Add robots.txt (belt-and-suspenders)

Install the **Robots.txt Editor** plugin, or manually create/edit `robots.txt` at WordPress root:

```
User-agent: *
Disallow: /
```

This blocks all crawlers from the WordPress site itself.

### 3.4 Optional: Restrict Access

For extra security:
- **IP allowlist:** If your host supports it, restrict WP Admin access to your IP.
- **Basic auth:** Add HTTP basic auth in front of the entire WordPress site (via host panel or `.htaccess`).
- **Application passwords (WP 5.6+):** Only needed if you want authenticated GraphQL queries.

---

## 4. Authentication (If Needed)

For **public published posts**, WPGraphQL serves data without authentication by default. This is the recommended setup.

If you need to query **draft posts** or **private data**:

1. In WP Admin: go to **Users > Your Profile**
2. Scroll to **Application Passwords**
3. Create a new application password (name it "Next.js Blog")
4. Copy the generated password
5. Use HTTP Basic Auth in your fetch calls:
   ```
   Authorization: Basic base64(username:app_password)
   ```
6. Add to your `.env.local`:
   ```
   WORDPRESS_AUTH_TOKEN=base64_encoded_credentials
   ```

For most blogs, **unauthenticated access to published posts is sufficient**.

---

## 5. Environment Variables for Next.js

After setup, add these to your Vercel project (or `.env.local` for local dev):

```env
WORDPRESS_GRAPHQL_URL=https://YOUR_WP_HOST/graphql
```

The other variables (`NEXT_PUBLIC_SITE_URL`, `BLOG_REVALIDATE_SECONDS`) are already defined in `.env.example`.

### Setting in Vercel

1. Go to your Vercel project dashboard
2. **Settings > Environment Variables**
3. Add `WORDPRESS_GRAPHQL_URL` with your GraphQL endpoint
4. Redeploy

---

## 6. Content Workflow

1. **Write posts** in WordPress Admin (rich editor, media library, categories/tags)
2. **Publish** — the post becomes available via GraphQL immediately
3. **Next.js picks it up** within `BLOG_REVALIDATE_SECONDS` (default: 1 hour) via ISR
4. No redeploy needed — ISR handles cache invalidation automatically

For **instant updates**, you can:
- Set `BLOG_REVALIDATE_SECONDS=60` (1 minute) for near-real-time
- Or implement an on-demand revalidation webhook (advanced, not covered here)

---

## Quick Reference

| Item | Value |
|------|-------|
| GraphQL Endpoint | `https://YOUR_WP_HOST/graphql` |
| Required Plugin | WPGraphQL |
| Optional Plugins | Yoast SEO + WPGraphQL for Yoast SEO |
| Auth Required | No (for public posts) |
| WordPress Indexed | No (robots disallow + reading setting) |
| Next.js Canonical | `https://findbackflowtesters.com/blog/*` |
| ISR Revalidation | 3600s default (configurable) |
