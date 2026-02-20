'use client'

/**
 * Log a lead funnel event to the server-side audit table.
 * Fire-and-forget — never blocks UI.
 */
export function logLeadEvent(params: {
  event: string
  providerId?: string
  providerName?: string
  pageUrl?: string
  metadata?: Record<string, unknown>
}) {
  try {
    fetch('/api/lead-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: params.event,
        providerId: params.providerId,
        providerName: params.providerName,
        pageUrl: params.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : ''),
        metadata: params.metadata,
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Never break the app for analytics
  }
}
