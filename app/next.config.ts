import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [],
  },
  // pdf-parse ve xlsx'i webpack'ten çıkar — Node.js native olarak yüklesin
  serverExternalPackages: ['pdf-parse', 'xlsx', '@sparticuz/chromium'],
  // Vercel standalone output yerine platform native kullanır — worker dosyaları için gerekli
  outputFileTracingIncludes: {
    '/api': ['./node_modules/pdf-parse/dist/**/*'],
  },
  // Vercel build — TypeScript hataları build'i durdurmasın (Next 16'da lint build'de çalışmaz)
  typescript: { ignoreBuildErrors: true },
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

// Sentry: sadece hata yakalama. Source map yükleme kapalı (auth token gerekmez),
// telemetri kapalı; DSN yoksa SDK zaten devre dışı.
export default withSentryConfig(nextConfig, {
  org: 'finrate',
  project: 'javascript-nextjsfinrate-web',
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
  widenClientFileUpload: false,
})
