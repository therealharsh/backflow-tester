/**
 * Image selection utilities — filters junk images before display.
 */

const JUNK_URL_PATTERNS = [
  'logo', 'favicon', 'icon', 'sprite', 'placeholder', 'stock',
  'catalog', 'product', 'sku', 'banner', 'badge', 'avatar',
  'background', 'bg-', 'pattern', 'texture', 'separator',
  'facebook', 'twitter', 'instagram', 'youtube', 'linkedin',
  'maps.google', 'maps.gstatic', 'streetview',
]

/** Return true if the URL looks like a junk/irrelevant image. */
export function isJunkImageUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return true
  const lower = url.toLowerCase()
  if (JUNK_URL_PATTERNS.some((p) => lower.includes(p))) return true
  // Reject tiny dimension hints in URL (e.g. "44x44", "s44-p")
  if (/[_-]s\d{1,2}[_-]/.test(lower)) return true      // Google s44 thumbnails
  if (/\/s\d{2,3}\//.test(lower)) return true           // /s44/ paths
  return false
}

/** Parse image_urls from provider (handles array or JSON string). */
export function parseImageUrls(image_urls: unknown): string[] {
  if (Array.isArray(image_urls)) return image_urls as string[]
  if (typeof image_urls === 'string') {
    try { return JSON.parse(image_urls) } catch { return [] }
  }
  return []
}

/** Patterns that suggest a quality on-site / professional photo. */
const PREFERRED_PATTERNS = [
  'backflow', 'technician', 'team', 'vehicle', 'van', 'truck',
  'exterior', 'building', 'storefront', 'crew', 'plumber',
  'service', 'photo', 'AF1Q',
]

/** Patterns that suggest a product shot, diagram, or irrelevant image. */
const PENALIZED_PATTERNS = [
  'product', 'faucet', 'valve', 'part', 'diagram',
  'coupon', 'deal', 'promo', 'flyer', 'menu',
]

function scoreImage(url: string, index: number): number {
  const lower = url.toLowerCase()
  let score = 0
  for (const p of PREFERRED_PATTERNS) if (lower.includes(p)) score += 1
  for (const p of PENALIZED_PATTERNS) if (lower.includes(p)) score -= 2
  // Prefer images appearing earlier (Google primary photos come first)
  score -= index * 0.1
  // Prefer larger Google image sizes (=w400 or higher)
  const sizeMatch = lower.match(/=w(\d+)/)
  if (sizeMatch && parseInt(sizeMatch[1]) >= 400) score += 1
  return score
}

/**
 * Choose the best displayable image URL for a provider.
 * Scores images by relevance, preferring on-site/professional photos.
 * Returns null if nothing usable is found.
 */
export function chooseBestImage(image_urls: unknown): string | null {
  const urls = parseImageUrls(image_urls).filter((u) => !isJunkImageUrl(u))
  if (urls.length === 0) return null
  if (urls.length === 1) return urls[0]

  let bestUrl = urls[0]
  let bestScore = scoreImage(urls[0], 0)
  for (let i = 1; i < urls.length; i++) {
    const s = scoreImage(urls[i], i)
    if (s > bestScore) {
      bestScore = s
      bestUrl = urls[i]
    }
  }
  return bestUrl
}

/** Generate initials from a business name (up to 2 words). */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}
