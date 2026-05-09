/**
 * ScenarioPanelV3 — Pure helper unit tests (Faz 7.3.45 + 7.3.45.1)
 *
 * Sadece named export olan pure fn'ler test edilir.
 * 'use client' component'i import ETMEZ.
 *
 * Test kapsamı:
 *   T_SJ1-4: sanitizeJargon — jargon temizleme
 *   T_DETAY1-3: override case mantığı — çelişki giderme
 *   T_DETAY4-5: renderTargetFeasibilitySection — react-dom/server render
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { sanitizeJargon, renderTargetFeasibilitySection, buildNotReachedBannerMessage } from './ScenarioPanelV3'

// ─── T_SJ: sanitizeJargon ─────────────────────────────────────────────────────

describe('sanitizeJargon — jargon temizleme (Faz 7.3.45)', () => {

  test('T_SJ1: PRODUCTIVITY tavanı → Aktif Verimlilik tavanı', () => {
    const input  = 'PRODUCTIVITY tavanı B seviyesinde'
    const result = sanitizeJargon(input)

    expect(result).not.toContain('PRODUCTIVITY tavanı')
    expect(result).toContain('Aktif Verimlilik tavanı')
    expect(result).toContain('B seviyesinde')
  })

  test('T_SJ2: productivity score → aktif verimlilik skoru', () => {
    const input  = 'productivity score: 27%'
    const result = sanitizeJargon(input)

    expect(result).not.toContain('productivity score')
    expect(result).toContain('aktif verimlilik skoru')
    expect(result).toContain('27%')
  })

  test('T_SJ3: enum isimleri → Türkçe karşılık', () => {
    const cases: Array<[string, string]> = [
      ['SALES_ASSET_MISMATCH',         'Aktif Devir Hızı Sorunu'],
      ['RECEIVABLE_SLOWDOWN',          'Tahsilat Yavaşlaması'],
      ['INVENTORY_LOCK',               'Stok Kilitlenmesi'],
      ['WIP_LOCK',                     'Yarı Mamul Kilitlenmesi'],
      ['ADVANCES_LOCK',                'Avans Kilitlenmesi'],
      ['OPERATING_YIELD_GAP',          'Operasyonel Verimlilik Açığı'],
      ['CASH_GENERATION_GAP',          'Nakit Üretim Yetersizliği'],
      ['FIXED_ASSET_UNDERUTILIZATION', 'Aktif Kullanım Sorunu'],
    ]
    for (const [key, expected] of cases) {
      const result = sanitizeJargon(key)
      expect(result).not.toContain(key)
      expect(result).toBe(expected)
    }
  })

  test('T_SJ4: temiz Türkçe metin değişmeden döner', () => {
    const input  = 'BB hedefine ulaşılabilir. Portföy analizi tamamlandı.'
    const result = sanitizeJargon(input)

    expect(result).toBe(input)
  })

})

// ─── T_DETAY: Override-case mantığı ──────────────────────────────────────────

describe('T_DETAY — override case mantığı (Faz 7.3.45)', () => {

  /**
   * Detay section D'de overrideReached && hasConflict koşulu:
   * - overrideReached: da.executiveAnswer.targetMatchesRequest === true
   * - hasConflict:     sanitizeJargon(feasText).includes('ulaşılamıyor')
   *
   * Koşul sağlanınca "ulaşılabileceğini doğruladı" mesajı gösterilmeli.
   * Bu testte UI render yerine hesaplama mantığını doğruluyoruz.
   */
  test('T_DETAY1: targetMatchesRequest=true + "ulaşılamıyor" içeren text → override aktif', () => {
    const targetMatchesRequest = true
    const rawFeasText = 'BB hedefine ulaşılamıyor — ulaşılabilir maksimum: B. PRODUCTIVITY tavanı sorunu.'

    const feasText    = sanitizeJargon(rawFeasText)
    const overrideReached = targetMatchesRequest === true
    const hasConflict     = feasText.includes('ulaşılamıyor')

    // Override koşulu aktif olmalı
    expect(overrideReached).toBe(true)
    expect(hasConflict).toBe(true)

    // Sanitize uygulandı: ham jargon kalmamalı
    expect(feasText).not.toContain('PRODUCTIVITY')
    expect(feasText).toContain('Aktif Verimlilik')

    // Override case'de gösterilecek mesajı simüle et
    const requestedTarget = 'BB'
    const overrideMsg = `Portföy analizi ${requestedTarget} seviyesine ulaşılabileceğini doğruladı.`
    expect(overrideMsg).toContain('ulaşılabileceğini doğruladı')
    expect(overrideMsg).toContain('BB')

    // Ana mesajda "ulaşılamıyor" YOK — details içinde (feasText) var ama ana metin değil
    expect(overrideMsg).not.toContain('ulaşılamıyor')
  })

  test('T_DETAY2: targetMatchesRequest=false → override ÇALIŞMAZ', () => {
    const targetMatchesRequest = false
    const rawFeasText = 'BB hedefine ulaşılamıyor — ulaşılabilir maksimum: B.'

    const feasText        = sanitizeJargon(rawFeasText)
    const overrideReached = targetMatchesRequest === true
    const hasConflict     = feasText.includes('ulaşılamıyor')

    // Override koşulu aktif DEĞİL
    expect(overrideReached).toBe(false)
    // hasConflict doğru tespit edilmiş ama override devreye GIRMEZ
    expect(hasConflict).toBe(true)

    // Normal path: feasText olduğu gibi gösterilir (jargon temizlenmiş hali)
    expect(feasText).toContain('ulaşılamıyor')
  })

  test('T_DETAY3: targetMatchesRequest=true ama "ulaşılamıyor" YOK → override ÇALIŞMAZ', () => {
    const targetMatchesRequest = true
    const rawFeasText = 'BB hedefine ulaşılabilir. 2 kategori iyileşme mümkün.'

    const feasText        = sanitizeJargon(rawFeasText)
    const overrideReached = targetMatchesRequest === true
    const hasConflict     = feasText.includes('ulaşılamıyor')

    // Override için her iki koşul da gerekli: biri yok
    expect(overrideReached).toBe(true)
    expect(hasConflict).toBe(false)  // çelişki yok

    // Override DEĞİL — normal path, temiz metin gösterilir
    expect(feasText).toBe(rawFeasText)  // değişmemiş (temiz Türkçe)
  })

})

// ─── T_DETAY_RENDER: renderTargetFeasibilitySection (Faz 7.3.45.1) ─────────

describe('T_DETAY_RENDER — renderTargetFeasibilitySection render dogrulamasi', () => {

  test('T_DETAY4: override+conflict → tek pozitif mesaj, feasText DOM\'da yok', () => {
    const html = renderToStaticMarkup(
      renderTargetFeasibilitySection({
        overrideReached: true,
        hasConflict:     true,
        feasText:        'BB hedefine ulasılamıyor — ulasılabilir maksimum: B',
        target:          'BB',
      })
    )

    // Pozitif override mesaji mevcut (ASCII-safe kontrol: 'seviyesine' sadece override mesajinda)
    expect(html).toContain('seviyesine')
    expect(html).toContain('BB')

    // feasText DOM'da YOK — cakisma yok
    expect(html).not.toContain('ulasılamıyor')
    expect(html).not.toContain('ulasılabilir maksimum')

    // <details> blogu kaldirildi — hic yok
    expect(html).not.toContain('Motor tahmini detayı')
  })

  test('T_DETAY5: normal branch (override yok) → feasText gosterilir', () => {
    const html = renderToStaticMarkup(
      renderTargetFeasibilitySection({
        overrideReached: false,
        hasConflict:     true,
        feasText:        'BB hedefine ulasılamıyor — Aktif Verimlilik tavanı B',
        target:          'BB',
      })
    )

    // Normal path: sanitize edilmis feasText gosterilir
    expect(html).toContain('ulasılamıyor')
    expect(html).toContain('Aktif Verimlilik')

    // Pozitif override mesaji YOK
    expect(html).not.toContain('seviyesine')
  })

})

// ─── T_UI: buildNotReachedBannerMessage (Faz 7.3.50A.4) ─────────────────────

describe('buildNotReachedBannerMessage (Faz 7.3.50A.4)', () => {

  const FALLBACK = "Mevcut aksiyonlarla hedef rating'e tam ulaşılamıyor."

  // T_UI1 — ANA BUG: achievable < current → kalınır mesajı (CCC gösterilmez)
  test('T_UI1 — achievable(CCC) < current(B) → mevcut seviyede kalinir, CCC gosterilmez', () => {
    const msg = buildNotReachedBannerMessage('B', 'CCC')
    expect(msg).toContain('B seviyesinde kalınmaktadır')
    expect(msg).not.toContain('CCC')
  })

  // T_UI2 — Engine doğru: achievable > current → en yakın seviye gösterilir
  test('T_UI2 — achievable(BB) > current(B) → en yakin gercekci seviye BB', () => {
    const msg = buildNotReachedBannerMessage('B', 'BB')
    expect(msg).toContain('En yakın gerçekçi seviye: BB')
  })

  // T_UI3 — Eşit: achievable === current → kalınır mesajı
  test('T_UI3 — achievable(B) === current(B) → mevcut seviyede kalinir', () => {
    const msg = buildNotReachedBannerMessage('B', 'B')
    expect(msg).toContain('B seviyesinde kalınmaktadır')
  })

  // T_UI4 — Boş input → fallback
  test('T_UI4 — undefined/null input → fallback mesaji', () => {
    expect(buildNotReachedBannerMessage(undefined, undefined)).toBe(FALLBACK)
    expect(buildNotReachedBannerMessage('B', null)).toBe(FALLBACK)
    expect(buildNotReachedBannerMessage(null, 'BB')).toBe(FALLBACK)
  })

  // T_UI5 — Geçersiz rating → fallback
  test('T_UI5 — gecersiz rating string → fallback mesaji', () => {
    expect(buildNotReachedBannerMessage('B', 'XYZ')).toBe(FALLBACK)
    expect(buildNotReachedBannerMessage('XYZ', 'B')).toBe(FALLBACK)
  })

  // T_UI6 — Input normalize: trim + uppercase + +/- temizleme
  test('T_UI6 — input normalize: trim + case + +/- → dogru karar', () => {
    // '  b  ' ve '  ccc  ' → B(idx=4) ve CCC(idx=3) → achievable < current → kalinir
    const msg1 = buildNotReachedBannerMessage('  b  ', '  ccc  ')
    expect(msg1).toContain('B seviyesinde kalınmaktadır')

    // 'B+' → B (idx=4), 'B' → B (idx=4) → esit → kalinir
    const msg2 = buildNotReachedBannerMessage('B+', 'B')
    expect(msg2).toContain('B seviyesinde kalınmaktadır')
  })

})
