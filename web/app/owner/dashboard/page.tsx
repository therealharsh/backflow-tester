'use client'

import { Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'
import type { SubscriptionTier } from '@/types'
import Link from 'next/link'

interface DashboardData {
  provider: {
    place_id: string
    name: string
    phone: string | null
    website: string | null
    address: string | null
    city: string
    state_code: string
    provider_slug: string
    latitude: number | null
    longitude: number | null
    service_lat: number | null
    service_lng: number | null
    claim_email: string | null
    image_urls: string[]
    rating: number | null
    reviews: number
  }
  subscription: {
    tier: SubscriptionTier
    status: string
    stripe_subscription_id: string | null
    current_period_end: string | null
  }
  overrides: {
    name: string | null
    phone: string | null
    email: string | null
    website: string | null
    description: string | null
    cover_image_url: string | null
    gallery_image_urls: string[]
  } | null
  ownership: {
    owner_email: string
    verified_at: string
  }
}

const TIER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  free:    { label: 'Free',     color: 'text-gray-700',   bg: 'bg-gray-100' },
  starter: { label: 'Starter',  color: 'text-blue-700',   bg: 'bg-blue-100' },
  premium: { label: 'Pro',      color: 'text-purple-700', bg: 'bg-purple-100' },
  pro:     { label: 'Featured', color: 'text-amber-800',  bg: 'bg-amber-100' },
}

export default function OwnerDashboardPage() {
  return (
    <Suspense fallback={<Shell><LoadingSpinner /></Shell>}>
      <DashboardInner />
    </Suspense>
  )
}

function DashboardInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const upgraded = searchParams.get('upgraded') === 'true'
  const sessionId = searchParams.get('session_id')

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [noAuth, setNoAuth] = useState(false)
  const [error, setError] = useState('')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'edit' | 'plan'>('overview')
  const [signingOut, setSigningOut] = useState(false)
  const [verifiedTier, setVerifiedTier] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session?.access_token) {
        setAccessToken(sessionData.session.access_token)
        setUserEmail(sessionData.session.user?.email ?? null)
        handleLoad(sessionData.session.access_token)
      } else {
        setNoAuth(true)
        setLoading(false)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If returning from upgrade, default to overview to show the success
  useEffect(() => {
    if (upgraded) setActiveTab('overview')
  }, [upgraded])

  async function handleLoad(token: string) {
    if (sessionId) {
      try {
        const verifyRes = await fetch('/api/owner/verify-checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok) {
          console.error('[dashboard] verify-checkout failed:', verifyRes.status, verifyData)
        } else {
          console.log('[dashboard] verify-checkout success:', verifyData)
          if (verifyData.tier) setVerifiedTier(verifyData.tier)
        }
      } catch (err) {
        console.error('[dashboard] verify-checkout network error:', err)
      }
    }
    await loadDashboard(token)
  }

  async function loadDashboard(token: string) {
    try {
      const res = await fetch(`/api/owner/dashboard?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (res.status === 401) { setNoAuth(true); return }
      if (res.status === 404) { setError('No owned listing found. Complete onboarding first.'); return }
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load dashboard'); return }
      setData(json)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    router.push('/owner/login')
  }

  if (loading) return <Shell><LoadingSpinner /></Shell>
  if (noAuth) return <Shell><NoAuth /></Shell>
  if (error) return <Shell><ErrorState message={error} /></Shell>
  if (!data) return <Shell><ErrorState message="No data" /></Shell>

  const { provider: p, overrides, ownership } = data
  // If verify-checkout confirmed a tier but the DB read is stale, use the verified tier
  const sub = verifiedTier
    ? { ...data.subscription, tier: verifiedTier as DashboardData['subscription']['tier'], status: 'active' as const }
    : data.subscription
  const canEdit = ['starter', 'premium', 'pro'].includes(sub.tier) && sub.status === 'active'
  const tierInfo = TIER_LABELS[sub.tier] ?? TIER_LABELS.free
  const isFree = sub.tier === 'free'

  return (
    <Shell>
      {/* Logged-in bar */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-700 text-white flex items-center justify-center text-sm font-bold">
            {(userEmail ?? ownership.owner_email)?.[0]?.toUpperCase() ?? 'O'}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{userEmail ?? ownership.owner_email}</p>
            <p className="text-xs text-gray-500">Owner since {new Date(ownership.verified_at).toLocaleDateString()}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium disabled:opacity-50"
        >
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      {upgraded && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-6 text-sm text-emerald-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Plan upgraded successfully! Your premium features are now active.
        </div>
      )}

      {/* Business name + view listing */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
        <Link
          href={`/providers/${p.provider_slug}`}
          className="shrink-0 text-sm text-blue-600 hover:text-blue-800 font-medium"
          target="_blank"
        >
          View live listing &rarr;
        </Link>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
          Overview
        </TabButton>
        {canEdit && (
          <TabButton active={activeTab === 'edit'} onClick={() => setActiveTab('edit')}>
            Edit Listing
          </TabButton>
        )}
        <TabButton active={activeTab === 'plan'} onClick={() => setActiveTab('plan')}>
          {isFree ? 'Upgrade Plan' : 'Manage Plan'}
        </TabButton>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          provider={p}
          subscription={sub}
          overrides={overrides}
          tierInfo={tierInfo}
          canEdit={canEdit}
          isFree={isFree}
          onEditClick={() => setActiveTab('edit')}
          onUpgradeClick={() => setActiveTab('plan')}
        />
      )}

      {activeTab === 'edit' && canEdit && (
        <EditForm provider={p} overrides={overrides} accessToken={accessToken!} />
      )}

      {activeTab === 'plan' && (
        isFree ? (
          <FreeUpgrade
            providerPlaceId={p.place_id}
            accessToken={accessToken!}
          />
        ) : (
          <PlanDetails subscription={sub} tierInfo={tierInfo} />
        )
      )}
    </Shell>
  )
}

/* ── Tab button ──────────────────────────────────────────────── */

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

/* ── Overview tab ────────────────────────────────────────────── */

function OverviewTab({
  provider: p,
  subscription: sub,
  overrides,
  tierInfo,
  canEdit,
  isFree,
  onEditClick,
  onUpgradeClick,
}: {
  provider: DashboardData['provider']
  subscription: DashboardData['subscription']
  overrides: DashboardData['overrides']
  tierInfo: { label: string; color: string; bg: string }
  canEdit: boolean
  isFree: boolean
  onEditClick: () => void
  onUpgradeClick: () => void
}) {
  const displayName = overrides?.name || p.name
  const displayPhone = overrides?.phone || p.phone
  const displayEmail = overrides?.email || p.claim_email
  const displayWebsite = overrides?.website || p.website

  return (
    <div className="space-y-6">
      {/* Plan card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${tierInfo.bg} ${tierInfo.color}`}>
              {tierInfo.label}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              sub.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {sub.status === 'active' ? 'Active' : sub.status}
            </span>
            {sub.current_period_end && (
              <span className="text-xs text-gray-400">
                Renews {new Date(sub.current_period_end).toLocaleDateString()}
              </span>
            )}
          </div>
          {isFree && (
            <button onClick={onUpgradeClick} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Upgrade &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Business info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">Business Details</h2>
          {canEdit ? (
            <button onClick={onEditClick} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Edit &rarr;
            </button>
          ) : (
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">Upgrade to edit</span>
          )}
        </div>

        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
          <InfoRow label="Business Name" value={displayName} />
          <InfoRow label="Location" value={p.address ? `${p.address}, ${p.city}, ${p.state_code}` : `${p.city}, ${p.state_code}`} />
          <InfoRow label="Phone" value={displayPhone} />
          <InfoRow label="Email" value={displayEmail} />
          <InfoRow label="Website" value={displayWebsite} isLink />
          <InfoRow
            label="Rating"
            value={p.rating ? `${p.rating} stars (${p.reviews} review${p.reviews !== 1 ? 's' : ''})` : 'No reviews yet'}
          />
        </dl>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href={`/providers/${p.provider_slug}`}
          target="_blank"
          className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">View Your Listing</p>
            <p className="text-xs text-gray-500">See how customers see your page</p>
          </div>
        </Link>

        {canEdit ? (
          <button
            onClick={onEditClick}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Edit Listing</p>
              <p className="text-xs text-gray-500">Update your business info, photos & more</p>
            </div>
          </button>
        ) : (
          <button
            onClick={onUpgradeClick}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Upgrade Plan</p>
              <p className="text-xs text-gray-500">Get more visibility, leads & editing</p>
            </div>
          </button>
        )}
      </div>

      {/* Description preview */}
      {overrides?.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-2">Business Description</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{overrides.description}</p>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, isLink }: { label: string; value: string | null | undefined; isLink?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-900">
        {value ? (
          isLink ? (
            <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline underline-offset-2">
              {value}
            </a>
          ) : value
        ) : (
          <span className="text-gray-400">Not set</span>
        )}
      </dd>
    </div>
  )
}

/* ── Plan details (paid users) ───────────────────────────────── */

function PlanDetails({
  subscription: sub,
  tierInfo,
}: {
  subscription: DashboardData['subscription']
  tierInfo: { label: string; color: string; bg: string }
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${tierInfo.bg} ${tierInfo.color}`}>
            {tierInfo.label}
          </span>
          <span className="text-sm font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
            Active
          </span>
        </div>

        {sub.current_period_end && (
          <p className="text-sm text-gray-600 mb-4">
            Your plan renews on <strong>{new Date(sub.current_period_end).toLocaleDateString()}</strong>.
          </p>
        )}

        <p className="text-sm text-gray-500">
          To manage your subscription, change your plan, update payment method, or cancel,
          visit your{' '}
          <a
            href="https://billing.stripe.com/p/login/test"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
          >
            Stripe billing portal
          </a>.
        </p>
      </div>
    </div>
  )
}

/* ── Edit form ───────────────────────────────────────────────── */

function EditForm({
  provider: p,
  overrides,
  accessToken,
}: {
  provider: DashboardData['provider']
  overrides: DashboardData['overrides']
  accessToken: string
}) {
  const [form, setForm] = useState({
    name: overrides?.name || p.name || '',
    phone: overrides?.phone || p.phone || '',
    email: overrides?.email || p.claim_email || '',
    website: overrides?.website || p.website || '',
    description: overrides?.description ?? '',
    coverImageUrl: overrides?.cover_image_url ?? '',
    galleryImageUrls: overrides?.gallery_image_urls?.length ? overrides.gallery_image_urls : (p.image_urls ?? []),
    serviceLat: p.service_lat ?? p.latitude ?? null,
    serviceLng: p.service_lng ?? p.longitude ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  function update(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const res = await fetch('/api/owner/save-overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          providerPlaceId: p.place_id,
          overrides: {
            name: form.name || null,
            phone: form.phone || null,
            email: form.email || null,
            website: form.website || null,
            description: form.description || null,
            cover_image_url: form.coverImageUrl || null,
            gallery_image_urls: form.galleryImageUrls,
          },
          serviceLat: form.serviceLat,
          serviceLng: form.serviceLng,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save')
        return
      }

      setSaved(true)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }, [accessToken, p.place_id, form])

  async function handleUpload(files: FileList | null, target: 'cover' | 'gallery') {
    if (!files?.length) return
    setUploading(true)

    try {
      const fd = new FormData()
      fd.set('providerPlaceId', p.place_id)
      for (const f of files) fd.append('files', f)

      const res = await fetch('/api/owner/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
        return
      }

      const urls = (data.uploaded ?? []).map((u: { url: string }) => u.url)
      if (target === 'cover' && urls[0]) {
        update('coverImageUrl', urls[0])
      } else if (target === 'gallery') {
        update('galleryImageUrls', [...form.galleryImageUrls, ...urls])
      }
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Edit Listing</h2>
        <p className="text-xs text-gray-400">
          Edits are saved as overrides &mdash; your base listing data is preserved.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        {/* Name */}
        <Field label="Business Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder={p.name}
            className="input-field"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="(555) 123-4567"
              className="input-field"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="you@business.com"
              className="input-field"
            />
          </Field>
        </div>

        <Field label="Website">
          <input
            type="url"
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            placeholder={p.website ?? 'https://yourbusiness.com'}
            className="input-field"
          />
        </Field>

        <Field label="Description">
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Tell customers about your business, services, certifications..."
            className="input-field resize-none"
          />
        </Field>

        {/* Cover image */}
        <Field label="Cover Image">
          {form.coverImageUrl && (
            <div className="mb-2 relative inline-block">
              <img src={form.coverImageUrl} alt="Cover" className="h-32 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => update('coverImageUrl', '')}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
              >
                &times;
              </button>
            </div>
          )}
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files, 'cover')}
          />
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            disabled={uploading}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : form.coverImageUrl ? 'Replace image' : 'Upload cover image'}
          </button>
        </Field>

        {/* Gallery images */}
        <Field label="Gallery Images">
          {form.galleryImageUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {form.galleryImageUrls.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`Gallery ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => update('galleryImageUrls', form.galleryImageUrls.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files, 'gallery')}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Add gallery images'}
          </button>
        </Field>

        {/* Service area center */}
        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <Field label="Service Area Latitude" hint="Center of your service radius">
            <input
              type="number"
              step="any"
              value={form.serviceLat ?? ''}
              onChange={(e) => update('serviceLat', e.target.value ? Number(e.target.value) : null)}
              placeholder={String(p.latitude ?? '')}
              className="input-field"
            />
          </Field>
          <Field label="Service Area Longitude" hint="Center of your service radius">
            <input
              type="number"
              step="any"
              value={form.serviceLng ?? ''}
              onChange={(e) => update('serviceLng', e.target.value ? Number(e.target.value) : null)}
              placeholder={String(p.longitude ?? '')}
              className="input-field"
            />
          </Field>
        </div>
      </div>

      {/* Save */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {saved && (
        <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Changes saved! They&apos;ll appear on your listing page.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <style>{`
        .input-field {
          width: 100%;
          padding: 0.625rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input-field:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
      `}</style>
    </div>
  )
}

/* ── Shared sub-components ───────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

const UPGRADE_PLANS = [
  {
    key: 'starter',
    tier: 'starter' as const,
    name: 'Starter',
    price: 49,
    features: [
      'Edit your listing details on demand',
      'Appear higher in search results',
      'Highlighted listing card',
      '"Premium" badge on your listing',
      'Priority quote leads',
    ],
  },
  {
    key: 'pro',
    tier: 'premium' as const,
    name: 'Pro',
    price: 99,
    popular: true,
    features: [
      'Everything in Starter',
      'Higher placement than Starter',
      '"Top Rated" badge (if 4.7+ rating)',
      'Prominent "Get Quote" button',
      'Priority in nearby city results',
    ],
  },
  {
    key: 'featured',
    tier: 'pro' as const,
    name: 'Featured',
    price: 149,
    features: [
      'Everything in Pro',
      'Highest placement in results',
      '"Featured" badge on your listing',
      'Prominent card styling',
      'Maximum visibility across all pages',
    ],
  },
]

function FreeUpgrade({
  providerPlaceId,
  accessToken,
}: {
  providerPlaceId: string
  accessToken: string
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleChoosePlan(plan: typeof UPGRADE_PLANS[number]) {
    setLoading(plan.key)
    setError('')

    try {
      const res = await fetch('/api/owner/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ providerPlaceId, tier: plan.tier }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to create checkout')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Choose Your Plan
        </h2>
        <p className="text-gray-600 max-w-lg mx-auto">
          Get more visibility, more leads, and premium placement in search results.
          Cancel anytime.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-8 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-6">
        {UPGRADE_PLANS.map((plan) => (
          <div
            key={plan.key}
            className={`relative rounded-2xl border-2 p-6 flex flex-col ${
              plan.popular
                ? 'border-blue-600 bg-blue-50/30 shadow-lg'
                : 'border-gray-200 bg-white'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                <span className="text-gray-500 text-sm">/mo</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleChoosePlan(plan)}
              disabled={loading !== null}
              className={`w-full py-3 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                plan.popular
                  ? 'bg-blue-700 text-white hover:bg-blue-800'
                  : 'bg-white text-blue-700 border-2 border-blue-600 hover:bg-blue-50'
              }`}
            >
              {loading === plan.key ? 'Redirecting...' : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-8">
        All plans are billed monthly. Cancel anytime from your Stripe dashboard.
        No long-term contracts.
      </p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {children}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="text-center py-16">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-sm text-gray-500">Loading dashboard...</p>
    </div>
  )
}

function NoAuth() {
  return (
    <div className="text-center py-16">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
      <p className="text-sm text-gray-600 max-w-sm mx-auto mb-4">
        You need to be signed in to access your owner dashboard.
      </p>
      <Link
        href="/owner/login"
        className="inline-block px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
      >
        Sign In
      </Link>
      <p className="text-sm text-gray-500 mt-4">
        Don&apos;t have an account?{' '}
        <Link href="/claim" className="text-blue-600 hover:text-blue-800 font-medium">
          Claim your listing
        </Link>
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Something Went Wrong</h2>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      <Link href="/claim" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
        Back to Claim Page &rarr;
      </Link>
    </div>
  )
}
