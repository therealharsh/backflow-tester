interface Props {
  plan: 'starter' | 'pro' | 'featured' | null
  rating?: number | null
  reviews?: number
  size?: 'sm' | 'md'
}

export default function PremiumBadge({ plan, rating, reviews = 0, size = 'sm' }: Props) {
  if (!plan) return null

  let label: string
  let bgClass: string
  let textClass: string

  if (plan === 'featured') {
    label = 'Featured'
    bgClass = 'bg-amber-500/90'
    textClass = 'text-white'
  } else if (plan === 'pro' && rating && rating >= 4.7 && reviews >= 25) {
    label = 'Top Rated'
    bgClass = 'bg-blue-600/90'
    textClass = 'text-white'
  } else {
    label = 'Premium'
    bgClass = 'bg-blue-600/90'
    textClass = 'text-white'
  }

  const sizeClass = size === 'sm'
    ? 'text-[11px] px-2.5 py-1'
    : 'text-xs px-3 py-1.5'

  return (
    <span className={`inline-flex items-center gap-1 font-bold backdrop-blur-sm rounded-full shadow ${bgClass} ${textClass} ${sizeClass}`}>
      <svg className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      {label}
    </span>
  )
}
