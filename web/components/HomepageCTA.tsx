'use client'

export default function HomepageCTA() {
  function handleClick() {
    const navBtn = document.querySelector<HTMLButtonElement>('[data-nav-quote]')
    if (navBtn) navBtn.click()
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold text-base px-7 py-4 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(255,255,255,0.35)] hover:ring-2 hover:ring-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-800 transition-all duration-200"
    >
      Get a Free Quote
      <span aria-hidden="true">&rarr;</span>
    </button>
  )
}
