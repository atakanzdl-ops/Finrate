import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  images: {
    remotePatterns: [],
  },
  // pdf-parse ve xlsx'i webpack'ten çıkar — Node.js native olarak yüklesin
  serverExternalPackages: ['pdf-parse', 'xlsx'],
}

export default nextConfig
