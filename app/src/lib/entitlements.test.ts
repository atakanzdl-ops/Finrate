/**
 * Hak sistemi — saf kural fonksiyonları (DB'ye dokunmaz)
 */
jest.mock('@/lib/db', () => ({ prisma: {} }))

import { canCreateEntity, canUploadNewPeriods, canUsePaidFeature, type Entitlements } from './entitlements'

const day = 24 * 60 * 60 * 1000
function ent(over: Partial<Entitlements> = {}): Entitlements {
  return {
    userId: 'u1', isAdmin: false, plan: 'DEMO',
    freeUntil: new Date(Date.now() + 7 * day), freeActive: true,
    credits: 0, creditsExpireAt: null, paidActive: false,
    entityCount: 0, periodCount: 0,
    ...over,
  }
}

describe('entitlements — ücretsiz plan', () => {
  test('süre içinde ilk firma ve ilk dönem serbest', () => {
    expect(canCreateEntity(ent())).toBeNull()
    expect(canUploadNewPeriods(ent(), 1)).toBeNull()
  })
  test('ikinci firma ve ikinci dönem engellenir', () => {
    expect(canCreateEntity(ent({ entityCount: 1 }))?.code).toBe('FREE_ENTITY_LIMIT')
    expect(canUploadNewPeriods(ent({ periodCount: 1 }), 1)?.code).toBe('FREE_PERIOD_LIMIT')
  })
  test('aynı dönemi yeniden yüklemek (yeni dönem = 0) serbest', () => {
    expect(canUploadNewPeriods(ent({ periodCount: 1 }), 0)).toBeNull()
  })
  test('süre dolunca yeni yükleme ve firma yok', () => {
    const e = ent({ freeActive: false, freeUntil: new Date(Date.now() - day) })
    expect(canCreateEntity(e)?.code).toBe('FREE_EXPIRED')
    expect(canUploadNewPeriods(e, 1)?.code).toBe('FREE_EXPIRED')
  })
  test('PDF / senaryo ücretli', () => {
    expect(canUsePaidFeature(ent())?.code).toBe('PAID_FEATURE')
  })
})

describe('entitlements — ücretli paket', () => {
  const paid = (over: Partial<Entitlements> = {}) => ent({ plan: 'STANDART', freeActive: false, freeUntil: null, credits: 4, creditsExpireAt: new Date(Date.now() + 300 * day), paidActive: true, ...over })
  test('hak varken yükleme, PDF ve senaryo serbest', () => {
    expect(canUploadNewPeriods(paid(), 3)).toBeNull()
    expect(canUsePaidFeature(paid())).toBeNull()
    expect(canCreateEntity(paid({ entityCount: 10 }))).toBeNull()
  })
  test('hak yetmezse engellenir', () => {
    expect(canUploadNewPeriods(paid({ credits: 1 }), 2)?.code).toBe('NO_CREDITS')
  })
  test('paket süresi dolunca engellenir', () => {
    const e = paid({ paidActive: false, creditsExpireAt: new Date(Date.now() - day) })
    expect(canUploadNewPeriods(e, 1)?.code).toBe('CREDITS_EXPIRED')
    expect(canUsePaidFeature(e)?.code).toBe('CREDITS_EXPIRED')
  })
})

describe('entitlements — yönetici', () => {
  test('her şey serbest', () => {
    const a = ent({ isAdmin: true, freeActive: false, entityCount: 99, periodCount: 99 })
    expect(canCreateEntity(a)).toBeNull()
    expect(canUploadNewPeriods(a, 50)).toBeNull()
    expect(canUsePaidFeature(a)).toBeNull()
  })
})
