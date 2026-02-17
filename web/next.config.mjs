/** @type {import('next').NextConfig} */
const nextConfig = {
  // Provider images come from many different CDNs — allow all HTTPS sources.
  // This is safe because Next.js image optimisation only proxies URLs that
  // the app itself renders (not arbitrary user input).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
