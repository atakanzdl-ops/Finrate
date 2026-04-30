/**
 * Faz 7.3.4F — A04 net nakit eligibility testleri
 *
 * getNetCashBalance invariantı:
 *   net = 100 + 101 + 102 + 108 − 103   (kontra çıkarılır, Math.abs yok)
 *
 * Test grupları:
 *   A04_CASH_PAYDOWN_ST  — 4 test: yeterli net nakit, kontra kesmesi, yetersiz, boş hesap
 *
 * Not: A16_CASH_BUFFER_BUILD Faz 7.3.6A3'te katalogdan silindi.
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'

const a04 = ACTION_CATALOG_V3['A04_CASH_PAYDOWN_ST']

// ─── A04_CASH_PAYDOWN_ST ──────────────────────────────────────────────────────

describe('A04_CASH_PAYDOWN_ST — customCheck net nakit eligibility', () => {
  it('pass: net nakit ≥ 500K (102=600K, 103=0)', () => {
    const analysis = {
      accounts: [
        { accountCode: '102', amount: 600_000 },
        { accountCode: '300', amount: 1_000_000 },
      ],
    }
    const result = a04.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(true)
  })

  it('pass: 102=900K, 103=200K → net=700K ≥ 500K (kontra çıkarılır)', () => {
    const analysis = {
      accounts: [
        { accountCode: '102', amount: 900_000 },
        { accountCode: '103', amount: 200_000 }, // kontra — çıkarılmalı
        { accountCode: '300', amount: 1_000_000 },
      ],
    }
    const result = a04.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(true)
  })

  it('fail: 102=400K, 103=0 → net=400K < 500K', () => {
    const analysis = {
      accounts: [
        { accountCode: '102', amount: 400_000 },
        { accountCode: '300', amount: 1_000_000 },
      ],
    }
    const result = a04.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/500K/)
  })

  it('fail: 102=600K, 103=200K → net=400K < 500K (kontra fazla kesti)', () => {
    // Eski bug: sumAccountsByPrefix(['102','103']) = 600K+200K = 800K → pass (YANLIŞ)
    // Düzeltme: 600K − 200K = 400K → fail (DOĞRU)
    const analysis = {
      accounts: [
        { accountCode: '102', amount: 600_000 },
        { accountCode: '103', amount: 200_000 }, // kontra
        { accountCode: '300', amount: 1_000_000 },
      ],
    }
    const result = a04.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(false)
  })
})
