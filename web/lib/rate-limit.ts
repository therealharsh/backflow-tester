/**
 * Simple in-memory sliding-window rate limiter for API routes.
 * Each serverless instance gets its own map — acceptable for burst protection.
 */

export function createRateLimiter(opts: {
  windowMs: number
  maxRequests: number
}) {
  const hits = new Map<string, number[]>()

  return function check(ip: string): { allowed: boolean; remaining: number } {
    const now = Date.now()
    const window = hits.get(ip)?.filter((t) => t > now - opts.windowMs) ?? []
    hits.set(ip, window)

    if (window.length >= opts.maxRequests) {
      return { allowed: false, remaining: 0 }
    }

    window.push(now)
    return { allowed: true, remaining: opts.maxRequests - window.length }
  }
}
