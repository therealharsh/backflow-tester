import type { Metadata } from 'next'
import Link from 'next/link'
import FAQAccordion from '@/components/FAQAccordion'
import { generateFAQSchema } from '@/lib/schema'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

const faqs = [
  {
    question: 'What is backflow testing?',
    answer:
      'Backflow testing is the process of inspecting a backflow prevention device to make sure it is working correctly and preventing contaminated water from flowing back into the public water supply. A certified tester uses specialized gauges to check the internal valves and pressure differentials of the device, ensuring it meets the performance standards required by your local water authority.',
  },
  {
    question: 'Why is backflow testing required?',
    answer:
      'Backflow testing is required to protect public drinking water from contamination. Cross-connections between potable water lines and non-potable sources (irrigation systems, fire suppression, boilers, etc.) can allow pollutants or chemicals to flow backward into the water supply if pressure drops. Local water districts and municipalities mandate annual testing to ensure backflow prevention devices are functioning properly and keeping your community\'s water safe.',
  },
  {
    question: 'How often is backflow testing required?',
    answer:
      'Most jurisdictions require annual backflow testing — once per year. Some high-risk facilities (hospitals, chemical plants, food processing) may require more frequent testing. Your local water authority sets the specific schedule and will typically send a notice when your test is due. Missing a deadline can result in fines or water service shutoff.',
  },
  {
    question: 'Who can perform a backflow test?',
    answer:
      'Backflow testing must be performed by a certified backflow tester who holds a valid certification from your state or local water authority. Certification typically requires completing a training program and passing both a written exam and a hands-on practical exam. Many plumbers hold backflow certifications, but not all — always verify a tester\'s credentials before hiring.',
  },
  {
    question: 'What is an RPZ valve?',
    answer:
      'An RPZ (Reduced Pressure Zone) valve is a type of backflow prevention device considered the gold standard for high-hazard applications. It contains two independent check valves with a relief valve between them. If either check valve fails, the relief valve opens and discharges water to prevent backflow. RPZ valves are commonly required for commercial properties, irrigation systems, and anywhere a serious contamination risk exists.',
  },
  {
    question: 'What is a DCVA (Double Check Valve Assembly)?',
    answer:
      'A DCVA (Double Check Valve Assembly) is a backflow prevention device with two independently operating check valves. It provides reliable protection for low-to-moderate hazard applications such as fire sprinkler systems and some commercial water connections. DCVAs are less complex than RPZ valves and don\'t have a relief valve, so they cannot be used in high-hazard situations.',
  },
  {
    question: 'What is a PVB (Pressure Vacuum Breaker)?',
    answer:
      'A PVB (Pressure Vacuum Breaker) is a backflow prevention device that uses a spring-loaded check valve and an air inlet valve to prevent backsiphonage. PVBs are commonly used in irrigation and lawn sprinkler systems. They must be installed at least 12 inches above the highest downstream point and can only protect against backsiphonage — not backpressure.',
  },
  {
    question: 'How much does backflow testing cost?',
    answer:
      'Backflow testing typically costs between $50 and $200 per device, depending on your location, the type of device (RPZ valves tend to cost more to test than PVBs), and whether any repairs are needed. Some providers offer discounts for testing multiple devices at the same property. The cost of not testing — potential fines, water shutoff, or contamination liability — far outweighs the testing fee.',
  },
  {
    question: 'What happens if I don\'t get my backflow device tested?',
    answer:
      'If you skip required backflow testing, your local water authority may issue fines, send violation notices, or even shut off your water service until the device is tested and certified. In some jurisdictions, the property owner can also be held liable for any contamination that results from a failed or untested backflow device. It\'s not worth the risk — schedule your annual test on time.',
  },
  {
    question: 'How do I choose a certified backflow tester near me?',
    answer:
      'Look for a tester who holds a valid certification from your state or local authority, has strong customer reviews, carries liability insurance, and has experience with your specific type of backflow device. Ask whether they handle the test report filing with your water district (many do). You can use FindBackflowTesters.com to compare certified providers in your area by ratings, reviews, and services offered.',
  },
  {
    question: 'Do providers file test results with the city or water district?',
    answer:
      'Many backflow testing providers will file your test results directly with your local water authority or city on your behalf. This is a valuable service since it ensures compliance and saves you the hassle. When choosing a provider, ask whether filing is included in their service. Our directory notes which providers offer this service where information is available.',
  },
]

export const metadata: Metadata = {
  title: 'Backflow Testing FAQs | Common Questions Answered',
  description:
    'Get answers to common questions about backflow testing: what it is, why it\'s required, how much it costs, how to choose a certified tester, and more.',
  alternates: { canonical: `${BASE}/faqs` },
  openGraph: {
    title: 'Backflow Testing FAQs',
    description: 'Common questions about backflow testing, prevention devices, and certification answered.',
    url: `${BASE}/faqs`,
    type: 'website',
  },
}

export default function FAQsPage() {
  const faqSchema = generateFAQSchema(faqs)

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'FAQs', item: `${BASE}/faqs` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div className="section py-12 max-w-3xl mx-auto">
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-600">FAQs</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Frequently Asked Questions</h1>
        <p className="text-gray-500 mb-8 max-w-xl">
          Everything you need to know about backflow testing, prevention devices, compliance
          requirements, and finding a certified tester near you.
        </p>

        <FAQAccordion items={faqs} />

        <div className="mt-10 bg-blue-50 rounded-xl p-6 sm:p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Still Have Questions?</h2>
          <p className="text-gray-600 text-sm mb-4">
            Can&apos;t find what you&apos;re looking for? Reach out to our team or explore our
            learning resources.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="btn-primary">
              Contact Us
            </Link>
            <Link href="/learn" className="btn-secondary">
              Learning Center
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
