/**
 * R6 — Engine Empty-Transaction Guard Testleri
 *
 * Değişiklik: scoreCandidate() içinde buildTransactions().length === 0 kontrolü.
 * Yevmiyesi boş olan aksiyon artık portfolio'ya eklenmez (0 puan döner).
 *
 * Motivasyon: A19_ADVANCE_TO_REVENUE brüt zarar (grossProfit ≤ 0) ortamında
 * buildTransactions [] döner ama eski kodda engine bunu seçiyordu ("ghost aksiyon").
 *
 * Test stratejisi: runEngineV3 ile tam entegrasyon — A19 brüt zarar ortamında
 * portfolio'ya girmemeli.
 */

import { runEngineV3 } from '../engineV3'
import type { EngineInput } from '../engineV3'

// ─── Brüt zarar ortamı (A19 buildTransactions [] döner) ──────────────────────

const GROSS_LOSS_INPUT: EngineInput = {
  sector:        'CONSTRUCTION',
  currentRating: 'B',
  targetRating:  'BBB',
  accountBalances: {
    '102': 5_000_000,    // nakit
    '120': 20_000_000,   // alacaklar
    '153': 10_000_000,   // stok
    '252': 30_000_000,   // binalar
    '300': 25_000_000,   // KV borç
    '320': 10_000_000,   // satıcılar
    '340': 15_000_000,   // alınan avanslar → A19 için kaynak
    '400': 40_000_000,   // UV borç
    '500': 10_000_000,   // sermaye
    '570': 15_000_000,   // geçmiş yıl kârları
  },
  incomeStatement: {
    netSales:          100_000_000,
    costOfGoodsSold:   110_000_000,   // COGS > gelir → brüt zarar
    grossProfit:       -10_000_000,   // ZARAR — A19 buildTransactions [] döner
    operatingProfit:   -15_000_000,
    netIncome:         -20_000_000,
    interestExpense:     5_000_000,
  },
}

describe('R6 — Engine Empty-Transaction Guard', () => {

  // T1: Brüt zarar ortamında A19 portfolio'ya girmemeli
  test('T1 — A19 brüt zarar: buildTransactions [] → portfolio dışı', () => {
    const result = runEngineV3(GROSS_LOSS_INPUT)

    // result.portfolio tüm seçilen aksiyonlar (tüm horizon'lar)
    const allActionIds = result.portfolio.map(a => a.actionId)

    // A19 brüt zarar ortamında seçilmemeli
    expect(allActionIds).not.toContain('A19_ADVANCE_TO_REVENUE')
  })

  // T2: Aynı firma A19 görmeli miydik? Avans(340)=15M var ama grossProfit<0
  // → Engine guard devreye girdi, 0 puan → seçilmedi
  test('T2 — A19 aday ama puan sıfır → seçilmedi (engine guard aktif)', () => {
    const result = runEngineV3({
      ...GROSS_LOSS_INPUT,
      options: { allowedActionIds: ['A19_ADVANCE_TO_REVENUE'] },
    })

    // allowedActionIds sadece A19 → ya seçilir ya da seçilmez (ama 0 puan ile seçilmemeli)
    const a19Selected = result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')
    // Brüt zarar + grossProfit<0 → buildTransactions [] → 0 puan → not selected
    expect(a19Selected).toBeUndefined()
  })

  // T3: Pozitif grossProfit ortamında A19 seçilebilir (guard yanlış tetiklenmemeli)
  test('T3 — Pozitif grossProfit + avans → A19 seçilebilir (false positive yok)', () => {
    const result = runEngineV3({
      ...GROSS_LOSS_INPUT,
      incomeStatement: {
        ...GROSS_LOSS_INPUT.incomeStatement,
        costOfGoodsSold: 70_000_000,
        grossProfit:     30_000_000,   // pozitif
        operatingProfit: 15_000_000,
        netIncome:        8_000_000,
      },
      options: { allowedActionIds: ['A19_ADVANCE_TO_REVENUE'] },
    })

    // grossProfit > 0 + avans(340)=15M → A19 seçilebilmeli
    const a19Selected = result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')
    expect(a19Selected).toBeDefined()
  })

})
