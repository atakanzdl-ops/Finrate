/**
 * accountMapper.ts — 350/358 constructionProgressBillings unit testleri (Faz 7.3.4B0.1)
 *
 * Doğrulanıyor:
 *   - rebuildAggregateFromAccounts totalCurrentLiabilities 350+358'i dahil ediyor
 *   - checkBalance() 350+358'i KV yükümlülük olarak sayıyor
 *   - DRY: tek constructionProgressBillings helper, iki yerde kullanım
 */

import { rebuildAggregateFromAccounts, checkBalance } from '../accountMapper'

// ─── rebuildAggregateFromAccounts: 350/358 ────────────────────────────────────

describe('rebuildAggregateFromAccounts — 350/358 constructionProgressBillings', () => {
  it('totalCurrentLiabilities 350 ve 358 dahil edilir', () => {
    const accounts = [
      { accountCode: '300', amount: 1_000_000 },
      { accountCode: '320', amount:   500_000 },
      { accountCode: '340', amount: 5_000_000 },
      { accountCode: '350', amount: 30_000_000 },
      { accountCode: '358', amount: 16_896_296.36 },
    ]
    const result = rebuildAggregateFromAccounts(accounts)
    // 300 + 320 + 340 + 350 + 358
    // = 1,000,000 + 500,000 + 5,000,000 + 30,000,000 + 16,896,296.36
    // = 53,396,296.36
    expect(result.totalCurrentLiabilities).toBeCloseTo(53_396_296.36, 2)
  })

  it('350 yokken totalCurrentLiabilities düşük kalır (regression guard)', () => {
    const without350 = [
      { accountCode: '300', amount: 1_000_000 },
      { accountCode: '320', amount:   500_000 },
      { accountCode: '340', amount: 5_000_000 },
    ]
    const with350 = [
      ...without350,
      { accountCode: '350', amount: 30_000_000 },
      { accountCode: '358', amount: 16_896_296.36 },
    ]
    const rWithout = rebuildAggregateFromAccounts(without350)
    const rWith    = rebuildAggregateFromAccounts(with350)
    expect(rWith.totalCurrentLiabilities).toBeGreaterThan(rWithout.totalCurrentLiabilities)
    expect(rWith.totalCurrentLiabilities - rWithout.totalCurrentLiabilities).toBeCloseTo(46_896_296.36, 2)
  })

  it('DEKAM 2024 benzeri: 350=358=46,896,296.36 — constructionProgressBillings = 93,792,592.72', () => {
    const accounts = [
      { accountCode: '350', amount: 46_896_296.36 },
      { accountCode: '358', amount: 46_896_296.36 },
    ]
    const result = rebuildAggregateFromAccounts(accounts)
    expect(result.constructionProgressBillings).toBeCloseTo(93_792_592.72, 2)
    expect(result.totalCurrentLiabilities).toBeCloseTo(93_792_592.72, 2)
  })

  it('constructionProgressBillings alanı döndürülüyor (field mevcut)', () => {
    const accounts = [
      { accountCode: '350', amount: 1000 },
    ]
    const result = rebuildAggregateFromAccounts(accounts)
    expect(result).toHaveProperty('constructionProgressBillings')
    expect(result.constructionProgressBillings).toBe(1000)
  })

  it('350/358 yoksa constructionProgressBillings = 0', () => {
    const accounts = [
      { accountCode: '300', amount: 5000 },
    ]
    const result = rebuildAggregateFromAccounts(accounts)
    expect(result.constructionProgressBillings).toBe(0)
  })
})

// ─── checkBalance: 350/358 ────────────────────────────────────────────────────

describe('checkBalance — 350/358 KV yükümlülük tarafında sayılır', () => {
  it('350+358 totalLiabilitiesAndEquity tarafına dahil edilir', () => {
    const accounts = [
      { accountCode: '100', amount: 100 },
      { accountCode: '500', amount: 100 },
      { accountCode: '350', amount: 30_000_000 },
      { accountCode: '358', amount: 16_896_296.36 },
    ]
    const result = checkBalance(accounts)
    expect(result).toBeDefined()
    // 350+358 = 46,896,296.36 KV yükümlülük olarak sayılmalı
    // Aktif: 100 (küçük), Pasif+Özkaynak: 350+358+500 (büyük) → dengeli değil ama sayılıyor
    expect(result.totalLiabilitiesAndEquity).toBeCloseTo(46_896_296.36 + 100, 2)
  })

  it('350 olmadan ile 350 olan checkBalance farkı = 350 tutarı', () => {
    const base = [
      { accountCode: '100', amount: 5000 },
      { accountCode: '500', amount: 5000 },
    ]
    const with350 = [
      ...base,
      { accountCode: '350', amount: 10_000 },
    ]
    const rBase   = checkBalance(base)
    const rWith   = checkBalance(with350)
    expect(rWith.totalLiabilitiesAndEquity - rBase.totalLiabilitiesAndEquity)
      .toBeCloseTo(10_000, 2)
  })
})

// ─── Faz 7.3.21 — 440/449 longTermAdvancesReceived ───────────────────────────

describe('rebuildAggregateFromAccounts — 440/449 longTermAdvancesReceived (Faz 7.3.21)', () => {
  // T_AM1: 440 → longTermAdvancesReceived alanı doldurur
  it('T_AM1 — 440 bakiyesi longTermAdvancesReceived alanına yansır', () => {
    const accounts = [{ accountCode: '440', amount: 50_000_000 }]
    const result = rebuildAggregateFromAccounts(accounts)
    expect(result).toHaveProperty('longTermAdvancesReceived')
    expect(result.longTermAdvancesReceived).toBe(50_000_000)
  })

  // T_AM2: 449 + 440 birikir
  it('T_AM2 — 440 + 449 longTermAdvancesReceived\'a birikir', () => {
    const accounts = [
      { accountCode: '440', amount: 30_000_000 },
      { accountCode: '449', amount: 20_000_000 },
    ]
    const result = rebuildAggregateFromAccounts(accounts)
    expect(result.longTermAdvancesReceived).toBe(50_000_000)
  })

  // T_AM3: 440 totalNonCurrentLiabilities'a dahil edilir
  it('T_AM3 — 440 totalNonCurrentLiabilities\'a dahil edilir (tncl hesabı)', () => {
    const without440 = [{ accountCode: '400', amount: 10_000_000 }]
    const with440 = [
      { accountCode: '400', amount: 10_000_000 },
      { accountCode: '440', amount: 50_000_000 },
    ]
    const rWithout = rebuildAggregateFromAccounts(without440)
    const rWith    = rebuildAggregateFromAccounts(with440)
    expect(rWith.totalNonCurrentLiabilities).toBeCloseTo(60_000_000, 2)
    expect(rWith.totalNonCurrentLiabilities - rWithout.totalNonCurrentLiabilities)
      .toBeCloseTo(50_000_000, 2)
  })
})
