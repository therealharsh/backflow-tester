import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter } from '@/lib/rate-limit'

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 })

    expect(limiter('1.2.3.4').allowed).toBe(true)
    expect(limiter('1.2.3.4').allowed).toBe(true)
    expect(limiter('1.2.3.4').allowed).toBe(true)
  })

  it('blocks after exceeding the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 })

    limiter('1.2.3.4')
    limiter('1.2.3.4')
    const result = limiter('1.2.3.4')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('tracks IPs independently', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })

    limiter('1.1.1.1')
    expect(limiter('1.1.1.1').allowed).toBe(false)
    expect(limiter('2.2.2.2').allowed).toBe(true)
  })

  it('resets after window expires', () => {
    vi.useFakeTimers()
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 })

    limiter('1.2.3.4')
    expect(limiter('1.2.3.4').allowed).toBe(false)

    vi.advanceTimersByTime(1001)
    expect(limiter('1.2.3.4').allowed).toBe(true)

    vi.useRealTimers()
  })

  it('returns correct remaining count', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 })

    expect(limiter('1.2.3.4').remaining).toBe(2)
    expect(limiter('1.2.3.4').remaining).toBe(1)
    expect(limiter('1.2.3.4').remaining).toBe(0)
  })
})
