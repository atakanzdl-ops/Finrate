import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  serverExternalPackages: ['pdf-parse', 'xlsx'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals ?? []),
        'puppeteer-core',
        '@sparticuz/chromium',
        'pdf-lib',
      ]
    }
    return config
  },
}

export default nextConfig
