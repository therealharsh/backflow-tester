'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export default function NavGetQuote() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-1 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
      >
        Get Quote
      </button>
      {open && <GeneralQuoteModal open={open} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  onClose: () => void
}

function GeneralQuoteModal({ open, onClose }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [loadedAt] = useState(() => Date.now())

  // Form fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [honeypot, setHoneypot] = useState('')

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState('')
  const [locating, setLocating] = useState(false)

  // Focus first input on open
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      const el = modalRef.current?.querySelector<HTMLInputElement>('input[name="firstName"]')
      el?.focus()
    })
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, handleEscape])

  // Focus trap
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([aria-hidden="true"]), textarea, select, button, [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // ── Use my location ────────────────────────────────────────────────

  async function handleUseLocation() {
    if (locating) return
    setLocating(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300_000,
        })
      })

      const { latitude, longitude } = position.coords
      const res = await fetch(`/api/geo/reverse?lat=${latitude}&lng=${longitude}`)
      if (!res.ok) throw new Error()
      const place = await res.json()

      setAddress(place.formattedAddress || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
    } catch {
      setAddress('')
      setErrors((p) => ({ ...p, address: 'Could not get your location. Please enter your address manually.' }))
    } finally {
      setLocating(false)
    }
  }

  // ── Validation ─────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!firstName.trim()) errs.firstName = 'First name is required'
    if (!email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Please enter a valid email'
    if (phone && !/^[\d\s\-()+.]{7,20}$/.test(phone)) errs.phone = 'Please enter a valid phone number'
    if (!consent) errs.consent = 'Please agree to share your information with providers'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ─────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || success) return
    if (!validate()) return

    setSubmitting(true)
    setServerError('')

    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          notes: notes.trim(),
          honeypot,
          loadedAt,
          provider: {
            name: 'General Inquiry',
            city: '',
            stateCode: '',
            placeId: 'nav-get-quote',
          },
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        }),
      })

      if (res.ok) {
        setSuccess(true)
      } else {
        const body = await res.json().catch(() => ({}))
        setServerError(body.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const inputCls =
    'w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nav-quote-title"
        className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-emerald-50 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Quote Request Sent!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Thanks, {firstName}! We&apos;ll connect you with certified backflow testers in your area.
            </p>
            <button onClick={onClose} className="px-6 py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 id="nav-quote-title" className="text-xl font-bold text-gray-900">
                Get a Free Quote
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Tell us about your backflow testing needs and we&apos;ll connect you with certified providers in your area.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Honeypot */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="nav-company">Company</label>
                <input
                  type="text"
                  id="nav-company"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="nav-firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="nav-firstName"
                    name="firstName"
                    required
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: '' })) }}
                    className={`${inputCls} ${errors.firstName ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'}`}
                    placeholder="John"
                  />
                  {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="nav-lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="nav-lastName"
                    name="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={`${inputCls} border-gray-200`}
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="nav-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="nav-email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })) }}
                  className={`${inputCls} ${errors.email ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'}`}
                  placeholder="john@example.com"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="nav-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  id="nav-phone"
                  name="phone"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: '' })) }}
                  className={`${inputCls} ${errors.phone ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'}`}
                  placeholder="(555) 123-4567"
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              </div>

              {/* Address with Use my location */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="nav-address" className="block text-sm font-medium text-gray-700">
                    Service Address
                  </label>
                  {'geolocation' in (typeof navigator !== 'undefined' ? navigator : {}) && (
                    <button
                      type="button"
                      onClick={handleUseLocation}
                      disabled={locating}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:text-gray-400 disabled:cursor-wait"
                    >
                      {locating ? (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="3" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
                        </svg>
                      )}
                      {locating ? 'Locating...' : 'Use my location'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  id="nav-address"
                  name="address"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setErrors((p) => ({ ...p, address: '' })) }}
                  className={`${inputCls} ${errors.address ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-200'}`}
                  placeholder="123 Main St, City, State"
                />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="nav-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="nav-notes"
                  name="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${inputCls} border-gray-200 resize-none`}
                  placeholder="Any details about your backflow testing needs..."
                />
              </div>

              {/* Consent checkbox */}
              <div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); setErrors((p) => ({ ...p, consent: '' })) }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600 leading-snug">
                    I agree to share my information with certified backflow testing providers in my area so they can contact me with quotes.
                  </span>
                </label>
                {errors.consent && <p className="text-red-500 text-xs mt-1">{errors.consent}</p>}
              </div>

              {serverError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {serverError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  'Submit Quote Request'
                )}
              </button>
              <p className="text-xs text-gray-400 text-center mt-3">
                Your info will only be shared with providers in your area.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
