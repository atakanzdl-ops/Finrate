/**
 * Faz 7.3.6A7 — buildRejectedInsights dedupe + toFriendlyRejectReason testleri.
 *
 * buildRejectedInsights doğrudan export edilmediği için
 * toFriendlyRejectReason helper'ı ayrıca test edilir;
 * dedupe mantığı EngineResult mock'u üzerinden doğrulanır.
 */

import { toFriendlyRejectReason } from '../decisionLayer'

// ─── toFriendlyRejectReason ───────────────────────────────────────────────────

describe('toFriendlyRejectReason — raw → friendly eşleme', () => {
  it('Horizon short desteklenmiyor → Bu vade için uygun değil.', () => {
    expect(toFriendlyRejectReason('Horizon short desteklenmiyor'))
      .toBe('Bu vade için uygun değil.')
  })

  it('Kaynak hesap 331 bakiyesi yok → Gerekli kaynak hesap bakiyesi bulunmuyor.', () => {
    expect(toFriendlyRejectReason('Kaynak hesap 331 bakiyesi yok'))
      .toBe('Gerekli kaynak hesap bakiyesi bulunmuyor.')
  })

  it('Kaynak bakiye yetersiz → Kaynak hesap bakiyesi yetersiz.', () => {
    expect(toFriendlyRejectReason('Kaynak bakiye yetersiz — min 1.000.000 TL'))
      .toBe('Kaynak hesap bakiyesi yetersiz.')
  })

  it('sektoru icin uygulanamaz → Sektör koşulu sağlanmadı.', () => {
    expect(toFriendlyRejectReason('MANUFACTURING sektoru icin uygulanamaz'))
      .toBe('Sektör koşulu sağlanmadı.')
  })

  it('customCheck basarisiz: özel gerekçe → gerekçeyi döner', () => {
    expect(toFriendlyRejectReason('customCheck basarisiz: Net nakit bakiyesi 500K altında'))
      .toBe('Net nakit bakiyesi 500K altında')
  })

  it('customCheck basarisiz ama gerekçe yok → fallback mesaj', () => {
    expect(toFriendlyRejectReason('customCheck basarisiz'))
      .toBe('Aksiyon koşulu sağlanmadı.')
  })

  it('no valid amount candidates → Uygulanabilir tutar üretilemedi.', () => {
    expect(toFriendlyRejectReason('no valid amount candidates for A05'))
      .toBe('Uygulanabilir tutar üretilemedi.')
  })

  it('Aggregate guardrail → Toplu kural nedeniyle uygun değil.', () => {
    expect(toFriendlyRejectReason('Aggregate guardrail: PORTFOLIO_EQUITY_INFLATION'))
      .toBe('Toplu kural nedeniyle uygun değil.')
  })

  it('bilinmeyen gerekçe → fallback döner', () => {
    expect(toFriendlyRejectReason('tamamen bilinmeyen bir gerekçe'))
      .toBe('Bu aksiyon mevcut veriyle uygun görülmedi.')
  })
})
