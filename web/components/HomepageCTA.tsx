'use client'

export default function HomepageCTA() {
  function handleClick() {
    const navBtn = document.querySelector<HTMLButtonElement>('[data-nav-quote]')
    if (navBtn) navBtn.click()
  }

  return (
    <button onClick={handleClick} className="btn-primary text-base px-8 py-4">
      Get a Free Quote
    </button>
  )
}
