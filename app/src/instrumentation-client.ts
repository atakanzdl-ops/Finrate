// Sentry — tarayıcı tarafı (Next.js instrumentation-client). DSN yoksa kapalı.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,   // oturum kaydı yok (KVKK)
  replaysOnErrorSampleRate: 0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
