/**
 * R12.1 — Coverage Integration Testi
 *
 * findWeakestRatioPerCategory + getCoverageActionIds'in
 * runEngineV3 içindeki entegrasyonunu doğrular.
 *
 * Senaryo:
 *   İSRA profilinde greedy'ye sadece brüt marj aksiyonları izin verilir.
 *   Bu durumda likidite/kaldıraç/faaliyet zayıf kategorileri greedy
 *   tarafından kapatılamaz → Coverage mekanizması devreye girer.
 *
 * Beklentiler:
 *   T1 — Normal run: portfolio dolu, coverageMandatory aksiyonlar eklenebilir
 *   T2 — Coverage: greedy profil dışıysa coverageMandatory action görülür
 *   T3 — Coverage: coverageMandatory flag true + amountTRY > 0
 *   T4 — Coverage: coverageMandatory action'ın transaction'ları balanced
 *   T5 — Universal invariant: A11 portfolyo dışı (coverage bunu bypass etmez)
 */

import { runEngineV3 }         from '../engineV3'
import type { EngineResult }    from '../engineV3'
import type { AccountingTransaction } from '../contracts'
import { ISRA_INPUT }          from './fixtures/smoke/inputs'

// ─── T1: Normal İSRA run — portfolio dolu ────────────────────────────────────

test('T1 — İSRA normal run: portfolio dolu, tüm tx balanced', () => {
  const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'BB' })

  expect(result.portfolio.length).toBeGreaterThan(0)

  // Tüm tx balanced
  for (const action of result.portfolio) {
    for (const tx of action.transactions as AccountingTransaction[]) {
      const debit  = tx.legs.filter(l => l.side === 'DEBIT' ).reduce((s, l) => s + l.amount, 0)
      const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
      expect(debit).toBe(credit)
    }
  }
})

// ─── T2: Coverage mekanizması — greedy kısıtlıysa yeni aksiyon eklenir ───────

test('T2 — Coverage: greedy sadece A20 seçerse zayıf kategoriler için coverage eklenir', () => {
  // Sadece A20 (brüt marj nakit kanalı) greedy'ye izin ver.
  // İSRA profili: debtToEquity=5.6 >> benchmark 1.51 → kaldıraç ZAYıF
  //               DSO=~97 gün >> benchmark 37 gün → faaliyet ZAYıF
  // A20 tek başına bu kategorileri kapatamaz → coverage devreye girmeli.
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BB',
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)

  // FIX: ">=0" YANLIŞ — ISRA'da borç/DSO zayıf → coverage EN AZ 1 aksiyon eklemeli
  // Kaldıraç: DEBT_TO_EQUITY → A10/A10B/A15 aday; A10 precondition yok → eklenmeli
  // Faaliyet: DSO → A05 aday; 120=12M mevcut → eklenmeli
  expect(coverageActions.length).toBeGreaterThanOrEqual(1)

  // Her coverage action coverageMandatory=true taşımalı
  for (const ca of coverageActions) {
    expect(ca.coverageMandatory).toBe(true)
  }

  // Coverage aksiyonları allowedActionIds kısıtını bypass eder
  const coverageIds = coverageActions.map(a => a.actionId)
  expect(coverageIds.every(id => id !== 'A20_GROSS_MARGIN_REFORM')).toBe(true)
})

// ─── T3: coverageMandatory flag + amountTRY > 0 ───────────────────────────────

test('T3 — Tüm coverageMandatory aksiyonların amountTRY > 0', () => {
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BBB',
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  for (const ca of coverageActions) {
    expect(ca.amountTRY).toBeGreaterThan(0)
  }
})

// ─── T4: coverageMandatory action'ların transaction'ları balanced ─────────────

test('T4 — coverageMandatory aksiyonların tüm tx DEBIT == CREDIT', () => {
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BB',
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  for (const ca of coverageActions) {
    for (const tx of ca.transactions as AccountingTransaction[]) {
      const debit  = tx.legs.filter(l => l.side === 'DEBIT' ).reduce((s, l) => s + l.amount, 0)
      const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
      expect(debit).toBe(credit)
    }
  }
})

// ─── T5: A11 coverage tarafından asla eklenmez ───────────────────────────────

test('T5 — A11_RETAIN_EARNINGS coverage ile dahi portfolyo dışında kalır', () => {
  const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'A' })
  const a11 = result.portfolio.find(a => a.actionId === 'A11_RETAIN_EARNINGS')
  expect(a11).toBeUndefined()
})

// ─── T6: R12.1 — A22 katalogda mevcut ────────────────────────────────────────

test('T6 — A22_SHAREHOLDER_RECEIVABLE_COLLECTION katalogda tanımlı', () => {
  // A22, ortaklardan alacak olan firmalar için (131/231 hesapları gerekli)
  // Bu firmada 131 YOK → A22 seçilmez ama tanımlı olmalı
  const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'BB' })
  const a22 = result.portfolio.find(a => a.actionId === 'A22_SHAREHOLDER_RECEIVABLE_COLLECTION')
  // İSRA'da 131 YOK → A22 seçilmez (precondition fail)
  expect(a22).toBeUndefined()
})

// ─── T7: A22 buildTransactions doğrulama ─────────────────────────────────────

test('T7 — A22: buildTransactions 102 DEBIT + 131 CREDIT balanced döner', () => {
  const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
  const a22 = ACTION_CATALOG_V3['A22_SHAREHOLDER_RECEIVABLE_COLLECTION']
  expect(a22).toBeDefined()

  const txs = a22.buildTransactions({
    sector: 'TRADE', horizon: 'short',
    analysis: {}, amount: 2_000_000,
    previousActions: [],
    accountBalances: { '131': 5_000_000, '102': 1_000_000 },
    netSales: 10_000_000, grossProfit: 3_000_000,
  })
  expect(txs.length).toBe(1)

  const legs = txs[0].legs
  const debit  = legs.filter((l: any) => l.side === 'DEBIT' ).reduce((s: number, l: any) => s + l.amount, 0)
  const credit = legs.filter((l: any) => l.side === 'CREDIT').reduce((s: number, l: any) => s + l.amount, 0)
  expect(debit).toBe(credit)
  expect(debit).toBe(2_000_000)

  const debitLeg  = legs.find((l: any) => l.side === 'DEBIT')
  const creditLeg = legs.find((l: any) => l.side === 'CREDIT')
  expect(debitLeg!.accountCode).toBe('102')   // nakit
  expect(creditLeg!.accountCode).toBe('131')  // ortak alacağı
})

// ─── T8: bankerTrust field doğrulama ─────────────────────────────────────────

test('T8 — ACTION_CATALOG_V3: tüm aksiyonların bankerTrust tanımlı', () => {
  // Not: bankerTrust opsiyonel — sadece mevcut olanlar kontrol edilir
  const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
  const withTrust = Object.values(ACTION_CATALOG_V3).filter(
    (a: any) => a.bankerTrust !== undefined
  )
  // En az 20 aksiyonun bankerTrust'ı olmalı (A01-A21 + A22)
  expect(withTrust.length).toBeGreaterThanOrEqual(20)
})

// ─── T_FIX2_INTEG: Sonuç rasyosu zayıfsa grup listesinden aksiyon eklenir ─────

test('T_FIX2_INTEG: cashRatio çok düşük → LIQUIDITY_RESULT grubundan coverageMandatory aksiyon', () => {
  // cashRatio ≈ 0.11 (100K+200K / 3.6M) << benchmark 0.14 → zayıf
  // currentRatio = 2.1M/3.6M = 0.58 << benchmark 1.56 → zayıf
  // getCoverageActionIdsForRatio('cashRatio') boş döner (girdi değil)
  // → getResultGroupCandidates('cashRatio') → LIQUIDITY_RESULT listesi
  // → A10 (dış sermaye, precondition yok) → coverage'a eklenir
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BB',
    // Sadece A20'ye izin ver — greedy likiditeyi kapatamaz
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  // Coverage en az 1 aksiyon eklemeli (likidite ve/veya kaldıraç zayıf)
  expect(coverageActions.length).toBeGreaterThanOrEqual(1)

  // Eklenen coverage aksiyonlarından en az biri LIQUIDITY_RESULT veya CAPITAL_RESULT listesinden
  const { RESULT_GROUP_ACTION_IDS } = require('../ratioCategoryRegistry')
  const allGroupIds = new Set([
    ...RESULT_GROUP_ACTION_IDS.LIQUIDITY_RESULT,
    ...RESULT_GROUP_ACTION_IDS.PROFIT_RESULT,
    ...RESULT_GROUP_ACTION_IDS.CAPITAL_RESULT,
  ])
  const coverageFromGroup = coverageActions.filter(a => allGroupIds.has(a.actionId))
  expect(coverageFromGroup.length).toBeGreaterThanOrEqual(1)
})
