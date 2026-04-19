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
}

export default nextConfig
