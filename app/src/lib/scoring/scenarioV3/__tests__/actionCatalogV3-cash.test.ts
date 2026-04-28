/**
 * Faz 7.3.4F — A04 ve A16 net nakit eligibility testleri
 *
 * getNetCashBalance invariantı:
 *   net = 100 + 101 + 102 + 108 − 103   (kontra çıkarılır, Math.abs yok)
 *
 * Test grupları:
 *   A04_CASH_PAYDOWN_ST  — 4 test: yeterli net nakit, kontra kesmesi, yetersiz, boş hesap
 *   A16_CASH_BUFFER_BUILD — 4 test: pozitif net nakit, kontra kesmesi, sıfır, negatif net
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'

const a04 = ACTION_CATALOG_V3['A04_CASH_PAYDOWN_ST']
const a16 = ACTION_CATALOG_V3['A16_CASH_BUFFER_BUILD']

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

// ─── A16_CASH_BUFFER_BUILD ────────────────────────────────────────────────────

describe('A16_CASH_BUFFER_BUILD — customCheck net nakit eligibility', () => {
  it('pass: 102=1M → net=1M > 0', () => {
    const analysis = {
      accounts: [
        { accountCode: '102', amount: 1_000_000 },
      ],
    }
    const result = a16.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(true)
  })

  it('pass: 100=200K, 102=500K, 103=100K → net=600K > 0 (kontra çıkarılır)', () => {
    const analysis = {
      accounts: [
        { accountCode: '100', amount: 200_000 },
        { accountCode: '102', amount: 500_000 },
        { accountCode: '103', amount: 100_000 }, // kontra
      ],
    }
    const result = a16.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(true)
  })

  it('fail: accounts boş → net=0 ≤ 0', () => {
    const analysis = { accounts: [] }
    const result = a16.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/A05\/A06\/A08\/A10/)
  })

  it('fail: 102=300K, 103=400K → net=−100K ≤ 0 (negatif net nakit)', () => {
    // Eski bug: 300K+400K = 700K → pass (YANLIŞ)
    // Düzeltme: 300K − 400K = −100K → fail (DOĞRU)
    const analysis = {
      accounts: [
        { accountCode: '102', amount: 300_000 },
        { accountCode: '103', amount: 400_000 }, // kontra, bakiyesi büyük
      ],
    }
    const result = a16.preconditions.customCheck!(analysis)
    expect(result.pass).toBe(false)
  })
})
