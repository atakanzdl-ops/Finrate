/**
 * middleware.ts — Next.js Edge Middleware (Faz 7.3.49)
 *
 * proxy.ts mantığını Next.js middleware olarak çalıştırır.
 * Auth redirect + Rate limit bu noktada devreye girer.
 *
 * Not: proxy.ts'i ayrı tutmak test edilebilirliği artırır.
 */
export { proxy as default, config } from './proxy'
