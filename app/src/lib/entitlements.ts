import { prisma } from '@/lib/db'

/**
 * Hak sistemi (tek kaynak).
 *
 *  ÜCRETSİZ (DEMO): kayıtta 14 gün. 1 firma, 1 dönem, skor + Hızlı Teşhis.
 *                   PDF rapor ve senaryo yok. Süre bitince yeni yükleme yok, mevcut sonuçlar görünür.
 *  ÜCRETLİ:         analiz hakkı (kredi). Her yeni firma-dönem 1 hak yer; aynı dönemi yeniden yüklemek hak yemez.
 *                   Krediler creditsExpireAt'e kadar geçerli; bu süre içinde PDF, senaryo, trend açık.
 *  YÖNETİCİ (role ADMIN): sınırsız.
 */

export const FREE_TRIAL_DAYS   = 14
export const FREE_MAX_ENTITIES = 1
export const FREE_MAX_PERIODS  = 1
export const CREDIT_VALIDITY_MONTHS = 12

export const PACKAGES = {
  BASLANGIC:   { label: 'Başlangıç',   credits: 4,   plan: 'STANDART' },
  SMMM:        { label: 'S.M.M.M',     credits: 20,  plan: 'STANDART' },
  PROFESYONEL: { label: 'Profesyonel', credits: 100, plan: 'PRO' },
} as const
export type PackageKey = keyof typeof PACKAGES

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
  FREE_EXPIRED:      'Ücretsiz deneme süreniz doldu. Devam etmek için bir paket satın alın (info@finrate.com.tr).',
  FREE_ENTITY_LIMIT: `Ücretsiz planda en fazla ${FREE_MAX_ENTITIES} firma açılabilir. Daha fazla firma için bir paket satın alın.`,
  FREE_PERIOD_LIMIT: `Ücretsiz planda ${FREE_MAX_PERIODS} dönem analiz edilebilir. Yeni dönem için bir paket satın alın.`,
  NO_CREDITS:        'Analiz hakkınız kalmadı. Yeni dönem yüklemek için paket satın alın (info@finrate.com.tr).',
  CREDITS_EXPIRED:   'Paketinizin geçerlilik süresi doldu. Yeni dönem yüklemek için paket yenileyin.',
  PAID_FEATURE:      'PDF rapor ve senaryo analizi ücretli paketlerde sunulur. Paketler için: info@finrate.com.tr',
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

/** Yeni firma açılabilir mi? */
export function canCreateEntity(e: Entitlements): Denial | null {
  if (e.isAdmin) return null
  if (e.plan === 'DEMO') {
    if (!e.freeActive) return deny('FREE_EXPIRED')
    if (e.entityCount >= FREE_MAX_ENTITIES) return deny('FREE_ENTITY_LIMIT')
    return null
  }
  if (!e.paidActive) return deny('CREDITS_EXPIRED')
  return null
}

/** `newPeriods` adet yeni firma-dönem yüklenebilir mi? (mevcut dönemin yeniden yüklenmesi serbest) */
export function canUploadNewPeriods(e: Entitlements, newPeriods: number): Denial | null {
  if (e.isAdmin || newPeriods <= 0) return null
  if (e.plan === 'DEMO') {
    if (!e.freeActive) return deny('FREE_EXPIRED')
    if (e.periodCount + newPeriods > FREE_MAX_PERIODS) return deny('FREE_PERIOD_LIMIT')
    return null
  }
  if (!e.paidActive) return deny('CREDITS_EXPIRED')
  if (e.credits < newPeriods) return deny('NO_CREDITS')
  return null
}

/** PDF rapor / senaryo gibi ücretli özellikler */
export function canUsePaidFeature(e: Entitlements): Denial | null {
  if (e.isAdmin) return null
  if (e.plan === 'DEMO') return deny('PAID_FEATURE')
  if (!e.paidActive) return deny('CREDITS_EXPIRED')
  return null
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

/** İstekten yönetici kontrolü */
export async function isAdminUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return u?.role === 'ADMIN'
}
