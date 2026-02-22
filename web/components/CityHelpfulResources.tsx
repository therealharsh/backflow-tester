import Link from 'next/link'
import { listPublishedPosts } from '@/lib/blog'

interface Props {
  state: string
  city: string
  basePath: string
}

const BLOG_LINKS: { slug: string; label: string }[] = [
  {
    slug: 'backflow-testing-cost-guide-2026',
    label: 'Backflow testing cost guide (2026 pricing)',
  },
  {
    slug: 'certified-backflow-tester-vs-plumber',
    label: 'Certified backflow tester vs. plumber: who should you hire?',
  },
]

export default async function CityHelpfulResources({ state, city, basePath }: Props) {
  const posts = await listPublishedPosts()
  const publishedSlugs = new Set(posts.map((p) => p.slug))

  const blogLinks = BLOG_LINKS.filter((b) => publishedSlugs.has(b.slug))

  return (
    <div className="mt-10 max-w-3xl rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Helpful resources</h2>
      <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
        <li>
          <Link href="/learn" className="text-blue-600 hover:text-blue-800 underline">
            How to choose a reliable backflow tester
          </Link>
        </li>
        <li>
          <Link href="/faqs" className="text-blue-600 hover:text-blue-800 underline">
            Backflow FAQs and compliance basics
          </Link>
        </li>
        {blogLinks.map((b) => (
          <li key={b.slug}>
            <Link href={`/blog/${b.slug}`} className="text-blue-600 hover:text-blue-800 underline">
              {b.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
