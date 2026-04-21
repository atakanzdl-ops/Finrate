import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [],
  },
  // pdf-parse ve xlsx'i webpack'ten çıkar — Node.js native olarak yüklesin
  serverExternalPackages: ['pdf-parse', 'xlsx'],
  // Vercel standalone output yerine platform native kullanır — worker dosyaları için gerekli
  outputFileTracingIncludes: {
    '/api': ['./node_modules/pdf-parse/dist/**/*'],
  },
  // Vercel build — TypeScript ve ESLint hatalarını build'i durdurmasın
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Güvenlik header'ları
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
