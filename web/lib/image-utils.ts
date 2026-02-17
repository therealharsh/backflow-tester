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

/**
 * Choose the best displayable image URL for a provider.
 * Returns null if nothing usable is found.
 */
export function chooseBestImage(image_urls: unknown): string | null {
  const urls = parseImageUrls(image_urls)
  for (const url of urls) {
    if (!isJunkImageUrl(url)) return url
  }
  return null
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
