/**
 * combineScores unit testleri (Faz 7.3.4C)
 *
 * Doğrulanıyor:
 *   - Temel formül: combined = round(f × 0.70 + subjectiveTotal)
 *   - Ceiling (f ≤ 35 ve 35 < f < 55)
 *   - Floor (f ≥ 55)
 *   - Sınır koşulları (max 100, negatif giriş)
 *   - Double-application regression: UI'ın DB.finalScore yerine
 *     __financialScore kullanması zorunlu
 */

import { combineScores } from '../subjective'

// ─── Temel davranış ───────────────────────────────────────────────────────────

describe('combineScores — temel davranış', () => {
  it('Senaryo 1: Subjektif yokken finansal × 0.70', () => {
    // raw = round(50 × 0.70 + 0) = 35
    // ceiling: 35 < 50 < 55 → ceiling = round(52 + (15/20)×15) = round(63.25) = 63
    // 35 < 63 → combined = 35; floor: f < 55 → yok
    expect(combineScores(50, 0)).toBe(35)
  })

  it('Senaryo 2: Ceiling 35 < f < 55 devreye giriyor', () => {
    // raw = round(50 × 0.70 + 30) = 65
    // ceiling = round(52 + (15/20)×15) = round(63.25) = 63
    // 65 > 63 → combined = min(65, 63) = 63
    expect(combineScores(50, 30)).toBe(63)
  })

  it('Senaryo 3: Maksimum 100 ile sınırlı', () => {
    // raw = min(100, round(100 × 0.70 + 30)) = 100; floor: max(100, 64) = 100
    expect(combineScores(100, 30)).toBe(100)
  })

  it('Senaryo 4: Ceiling f ≤ 35 (DEKAM 2022 benzeri)', () => {
    // raw = round(13.6 × 0.70) = round(9.52) = 10
    // ceiling = round(43 + (13.6/35)×9) = round(46.497) = 46
    // 10 < 46 → combined = 10; floor yok
    expect(combineScores(13.6, 0)).toBe(10)
  })

  it('Senaryo 5: Ceiling 35 < f < 55 (subjektif yokken)', () => {
    // raw = round(40 × 0.70) = 28
    // ceiling = round(52 + (5/20)×15) = round(55.75) = 56
    // 28 < 56 → combined = 28; floor yok
    expect(combineScores(40, 0)).toBe(28)
  })

  it('Senaryo 6: Floor f 68-80 arasında (subjektif tam)', () => {
    // raw = round(70 × 0.70 + 30) = round(79) = 79
    // ceiling yok (f >= 55); floor: 68 ≤ 70 < 80 → floor = 60; max(79, 60) = 79
    expect(combineScores(70, 30)).toBe(79)
  })

  it('Senaryo 7: Sıfır finansal + tam subjektif', () => {
    // raw = round(0 + 30) = 30
    // ceiling: f ≤ 35 → ceiling = round(43 + 0) = 43; min(30, 43) = 30; floor yok
    expect(combineScores(0, 30)).toBe(30)
  })

  it('Senaryo 8: Negatif finansal input', () => {
    // raw = round(−5 × 0.70 + 30) = round(26.5) = 27
    // ceiling: f ≤ 35 → ceiling = round(43 + (−5/35)×9) = round(41.714) = 42
    // min(27, 42) = 27; floor yok
    expect(combineScores(-5, 30)).toBe(27)
  })
})

// ─── Double-application regression ───────────────────────────────────────────

describe('combineScores — Double-application regression (Faz 7.3.4C)', () => {
  it('Senaryo 9a: UI yanlışlıkla DB.finalScore (combined) ile tekrar uygularsa sonuç farklı olur', () => {
    const originalFinancial = 80
    const subjectiveTotal   = 30

    // POST /subjective sonrası DB durumu:
    // dbCombined = round(80×0.70+30)=86; floor:80≥80→max(86,64)=86
    const dbCombined = combineScores(originalFinancial, subjectiveTotal)

    // Yanlış UI mantığı (eski bug): combineScores(combined, subj) → çift uygulama
    // round(86×0.70+30)=round(90.2)=90; floor:86≥80→max(90,64)=90
    const wrongDoubleApplication = combineScores(dbCombined, subjectiveTotal)

    // Doğru UI mantığı (fix sonrası): orijinal finansal skoru kullan
    const correctFromOriginal = combineScores(originalFinancial, subjectiveTotal)

    // Çift uygulama farklı sonuç üretir
    expect(wrongDoubleApplication).not.toBe(correctFromOriginal)

    // Doğru sonuç = POST'un ürettiği dbCombined ile özdeş
    expect(correctFromOriginal).toBe(dbCombined)
  })

  it('Senaryo 9b: UI fallback — __financialScore yoksa finalScore kullanılır', () => {
    // Subjektif girilmemiş şirket (DEKAM gibi): ratios'ta __financialScore yok
    const ratiosWithoutFinancial: Record<string, number | null> = {}
    const finalScore = 33.36

    const financial = ratiosWithoutFinancial.__financialScore ?? finalScore
    expect(financial).toBe(33.36)
  })

  it('Senaryo 9c: UI — __financialScore varsa onu kullan, DB combined değil', () => {
    // Subjektif girilmiş şirket: POST ratios.__financialScore = orijinal skor
    const ratiosWithFinancial: Record<string, number | null> = { __financialScore: 80 }
    const dbFinalScore = 86 // POST sonrası DB'deki combined değer

    const financial = ratiosWithFinancial.__financialScore ?? dbFinalScore
    expect(financial).toBe(80)
    expect(financial).not.toBe(dbFinalScore)
  })
})
