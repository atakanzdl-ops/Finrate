import { prisma } from '@/lib/db'

/**
 * Hak sistemi (tek kaynak).
 *
 *  ÜCRETSİZ (DEMO): kayıtta 14 gün, SINIRSIZ (tüm özellikler, firma ve dönem sayısı serbest).
 *                   Süre bitince yeni yükleme, senaryo ve PDF kapanır; mevcut sonuçlar görünür.
 *  ÜCRETLİ:         analiz hakkı (kredi). Her yeni firma-dönem 1 hak yer; aynı dönemi yeniden yüklemek hak yemez.
 *                   Krediler creditsExpireAt'e kadar geçerli; bu süre içinde PDF, senaryo, trend açık.
 *  YÖNETİCİ (role ADMIN): sınırsız.
 */

export const FREE_TRIAL_DAYS   = 14
export const CREDIT_VALIDITY_MONTHS = 12

// priceTRY: KDV dahil satış fiyatı (landing sayfasıyla aynı: ₺1.999 / ₺6.999 / ₺29.999)
export const PACKAGES = {
  BASLANGIC:   { label: 'Başlangıç',   credits: 4,   plan: 'STANDART', priceTRY: 1999 },
  SMMM:        { label: 'S.M.M.M',     credits: 20,  plan: 'STANDART', priceTRY: 6999 },
  PROFESYONEL: { label: 'Profesyonel', credits: 100, plan: 'PRO',      priceTRY: 29999 },
} as const
export type PackageKey = keyof typeof PACKAGES
export const isPackageKey = (k: unknown): k is PackageKey => typeof k === 'string' && k in PACKAGES

export interface Entitlements {
  userId: string
  isAdmin: boolean
  plan: string
  freeUntil: Date | null
  freeActive: boolean
  credits: number
  creditsExpireAt: Date | null
  paidActive: boolean        // kredi paketi süresi içinde mi (PDF/senaryo için)
  entityCount: number
  periodCount: number        // toplam analiz (firma-dönem) sayısı
}

export const ENTITLEMENT_MESSAGES = {
  FREE_EXPIRED:      '14 günlük ücretsiz deneme süreniz doldu. Devam etmek için bir paket satın alın (info@finrate.com.tr).',
  NO_CREDITS:        'Analiz hakkınız kalmadı. Yeni dönem yüklemek için paket satın alın (info@finrate.com.tr).',
  CREDITS_EXPIRED:   'Paketinizin geçerlilik süresi doldu. Devam etmek için paket yenileyin (info@finrate.com.tr).',
} as const

export async function getEntitlements(userId: string): Promise<Entitlements | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      subscription: { select: { plan: true, currentPeriodEnd: true, analysisCredits: true, creditsExpireAt: true } },
      _count: { select: { entities: true, analyses: true } },
    },
  })
  if (!user) return null
  const now = new Date()
  const sub = user.subscription
  const plan = sub?.plan ?? 'DEMO'
  const freeUntil = plan === 'DEMO' ? (sub?.currentPeriodEnd ?? null) : null
  const credits = sub?.analysisCredits ?? 0
  const creditsExpireAt = sub?.creditsExpireAt ?? null
  const paidActive = plan !== 'DEMO' && creditsExpireAt != null && creditsExpireAt > now
  return {
    userId,
    isAdmin: user.role === 'ADMIN',
    plan,
    freeUntil,
    freeActive: plan === 'DEMO' && freeUntil != null && freeUntil > now,
    credits,
    creditsExpireAt,
    paidActive,
    entityCount: user._count.entities,
    periodCount: user._count.analyses,
  }
}

export type Denial = { code: keyof typeof ENTITLEMENT_MESSAGES; message: string }
const deny = (code: keyof typeof ENTITLEMENT_MESSAGES): Denial => ({ code, message: ENTITLEMENT_MESSAGES[code] })

/** Yeni firma açılabilir mi? (ücretsiz deneme süresi içinde sınırsız) */
export function canCreateEntity(e: Entitlements): Denial | null {
  if (e.isAdmin) return null
  if (e.plan === 'DEMO') return e.freeActive ? null : deny('FREE_EXPIRED')
  if (!e.paidActive) return deny('CREDITS_EXPIRED')
  return null
}

/** `newPeriods` adet yeni firma-dönem yüklenebilir mi? (deneme süresinde sınırsız; pakette hak düşer) */
export function canUploadNewPeriods(e: Entitlements, newPeriods: number): Denial | null {
  if (e.isAdmin || newPeriods <= 0) return null
  if (e.plan === 'DEMO') return e.freeActive ? null : deny('FREE_EXPIRED')
  if (!e.paidActive) return deny('CREDITS_EXPIRED')
  if (e.credits < newPeriods) return deny('NO_CREDITS')
  return null
}

/** PDF rapor indirme — 14 günlük ücretsiz deneme içinde de açık; süre/paket dolunca kapalı */
export function canUsePaidFeature(e: Entitlements): Denial | null {
  if (e.isAdmin) return null
  if (e.plan === 'DEMO') return e.freeActive ? null : deny('FREE_EXPIRED')
  if (!e.paidActive) return deny('CREDITS_EXPIRED')
  return null
}

/** Senaryo / yol haritası — PDF ile aynı kural */
export function canUseScenario(e: Entitlements): Denial | null {
  return canUsePaidFeature(e)
}

/** Kredi düş (yönetici ve ücretsiz planda düşülmez). */
export async function consumeCredits(e: Entitlements, count: number): Promise<void> {
  if (e.isAdmin || e.plan === 'DEMO' || count <= 0) return
  await prisma.subscription.updateMany({
    where: { userId: e.userId, analysisCredits: { gte: count } },
    data: { analysisCredits: { decrement: count } },
  })
}

/** Yüklenecek dönemlerden hangileri zaten analiz edilmiş? (hak hesabı için) */
export async function listExistingAnalysisPeriods(
  entityId: string,
  periods: Array<{ year: number; period: string }>,
): Promise<Array<{ year: number; period: string }>> {
  if (periods.length === 0) return []
  return prisma.analysis.findMany({
    where: { entityId, OR: periods.map(p => ({ year: p.year, period: p.period })) },
    select: { year: true, period: true },
  })
}

/**
 * Paket tanımla (tek yol): kredi ekler, planı atar, geçerliliği 12 ay uzatır.
 * Yönetici paneli (havale) ve iyzico callback'i (kart) aynı fonksiyonu kullanır.
 * Abonelik kaydı yoksa oluşturur. `noteLine` yönetici notuna tarih damgasıyla eklenir.
 */
export async function grantPackage(userId: string, key: PackageKey, noteLine?: string) {
  const pkg = PACKAGES[key]
  const now = new Date()
  const plusMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x }

  const sub = await prisma.subscription.findUnique({ where: { userId }, select: { id: true, creditsExpireAt: true, notes: true } })
    ?? await prisma.subscription.create({
      data: { userId, plan: 'DEMO', billingCycle: 'MONTHLY', status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: now },
      select: { id: true, creditsExpireAt: true, notes: true },
    })

  // Süre: mevcut geçerlilik ileride ise ondan, değilse bugünden 12 ay
  const base = sub.creditsExpireAt && sub.creditsExpireAt > now ? sub.creditsExpireAt : now
  const expires = plusMonths(base, CREDIT_VALIDITY_MONTHS)
  const stamp = now.toLocaleDateString('tr-TR')
  const line = `${stamp}: ${pkg.label} paketi (+${pkg.credits} hak)${noteLine ? ' — ' + noteLine : ''}`

  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan: pkg.plan, status: 'ACTIVE',
      analysisCredits: { increment: pkg.credits },
      creditsExpireAt: expires,
      currentPeriodStart: now, currentPeriodEnd: expires,
      notes: [sub.notes, line].filter(Boolean).join('\n'),
    },
  })
}

/** İstekten yönetici kontrolü */
export async function isAdminUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return u?.role === 'ADMIN'
}
