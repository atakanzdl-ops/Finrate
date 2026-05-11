/**
 * Finrate — Hesap Kodu Bazlı Eliminasyon Utilities (Faz 7.4.1-B-1)
 *
 * Bu modül GroupEliminationEntry modelini (Faz 7.4.1-A) kullanan iki util sağlar:
 *
 *  1. applyEliminationsAtAccountLevel()
 *     Dönem + firma çifti + hesap kodu bazlı eliminasyon.
 *     Girdi: per-entity Map<entityId, Map<accountCode, amount>>
 *     Çıktı: aynı yapı, eliminasyonlar uygulanmış (deep copy, input değişmez)
 *
 *  2. entriesToAggregateEliminations()
 *     GroupEliminationEntry[] → InterCompanyEliminations (7 alan) köprüsü.
 *     BEYANNAME-only fallback ve scoring path için kullanılır.
 *
 * Mevcut consolidation.ts fonksiyonları (applyEliminations, aggregateFinancials,
 * calculateConsolidatedScore) değiştirilmemiştir.
 */

import type { GroupEliminationEntry } from '@prisma/client'
import type { InterCompanyEliminations }  from './consolidation'

// ─── UTIL 1: HESAP KODU BAZLI ELİMİNASYON ────────────────────────────────────

/**
 * Per-entity hesap bakiyelerini GroupEliminationEntry listesine göre günceller.
 *
 * - Sadece verilen (year, period) dönemine ait entry'ler işlenir.
 * - Input Map'i değiştirilmez; deep copy döndürülür.
 * - Bilinmeyen entity/hesap kodu için yeni Map otomatik oluşturulur
 *   (bakiye sıfırdan başlar, eliminasyon uygulanır — negatife düşebilir).
 * - Decimal Prisma tipi Number() ile dönüştürülür.
 * - Sıfır veya NaN amount'lar atlanır.
 *
 * Bilanço dengesi korunumu:
 *   fromAccountCode (aktif) -= amount  →  aktif azalır
 *   toAccountCode   (pasif) -= amount  →  pasif azalır
 *   Her iki taraf eşit miktarda düşer → Aktif = Pasif + Özkaynak denge korunur.
 */
export function applyEliminationsAtAccountLevel(
  balances: Map<string, Map<string, number>>,
  entries:  GroupEliminationEntry[],
  year:     number,
  period:   string,
): Map<string, Map<string, number>> {

  // ── Deep copy (input mutation engelle) ──────────────────────────────────────
  const result = new Map<string, Map<string, number>>()
  for (const [eid, codes] of balances) {
    result.set(eid, new Map(codes))
  }

  // ── Dönem filtresi ───────────────────────────────────────────────────────────
  const normalizedPeriod = period.trim().toUpperCase()
  const filtered = entries.filter(
    e =>
      e.year === year &&
      e.period.trim().toUpperCase() === normalizedPeriod,
  )

  // ── Her entry için çift taraflı eliminasyon ───────────────────────────────
  for (const entry of filtered) {
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount) || amount === 0) continue

    // From entity (alacaklı / satıcı taraf — aktif kalem azalır)
    const fromMap     = result.get(entry.fromEntityId) ?? new Map<string, number>()
    const fromCurrent = fromMap.get(entry.fromAccountCode) ?? 0
    fromMap.set(entry.fromAccountCode, fromCurrent - amount)
    result.set(entry.fromEntityId, fromMap)

    // To entity (borçlu / alıcı taraf — pasif kalem azalır)
    const toMap     = result.get(entry.toEntityId) ?? new Map<string, number>()
    const toCurrent = toMap.get(entry.toAccountCode) ?? 0
    toMap.set(entry.toAccountCode, toCurrent - amount)
    result.set(entry.toEntityId, toMap)
  }

  return result
}

// ─── UTIL 2: ENTRY → AGGREGATE KÖPRÜSÜ ──────────────────────────────────────

/**
 * GroupEliminationEntry dizisini mevcut InterCompanyEliminations (7 alan)
 * formatına çevirir.
 *
 * Kullanım alanları:
 *   - BEYANNAME-only gruplarda (financialAccounts yoksa) aggregate fallback
 *   - calculateConsolidatedScore() çağrısı için scoring path
 *
 * Hesap kodu → alan eşleştirmesi:
 *   600/601/602  (fromCode) → intercompanySales
 *   620/621/622/623 (toCode) → intercompanyPurchases
 *   131/132/133/120/121 (fromCode) → intercompanyReceivables
 *   331/332/333/320/321 (toCode)   → intercompanyPayables
 *   159 (fromCode) → intercompanyAdvancesGiven
 *   340 (toCode)   → intercompanyAdvancesReceived
 *   intercompanyProfit: Stok içi unrealized kâr — manuel entry gerekir (bu
 *     otomatik tespiti hesap kodu düzeyinde desteklenmez, 0 kalır).
 */
export function entriesToAggregateEliminations(
  entries: GroupEliminationEntry[],
  year:    number,
  period:  string,
): InterCompanyEliminations {

  const result: InterCompanyEliminations = {
    intercompanySales:            0,
    intercompanyPurchases:        0,
    intercompanyReceivables:      0,
    intercompanyPayables:         0,
    intercompanyAdvancesGiven:    0,
    intercompanyAdvancesReceived: 0,
    intercompanyProfit:           0,
  }

  const normalizedPeriod = period.trim().toUpperCase()
  const filtered = entries.filter(
    e =>
      e.year === year &&
      e.period.trim().toUpperCase() === normalizedPeriod,
  )

  for (const entry of filtered) {
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount)) continue

    const fromCode = entry.fromAccountCode
    const toCode   = entry.toAccountCode

    // Satışlar (600/601/602)
    if (['600', '601', '602'].includes(fromCode)) {
      result.intercompanySales += amount
    }

    // Satılan mallar maliyeti / SMM (620/621/622/623)
    if (['620', '621', '622', '623'].includes(toCode)) {
      result.intercompanyPurchases += amount
    }

    // IC alacaklar (131 Ortaklardan / 132 İştiraklerden / 133 Bağlı Ort. / 120-121 Ticari)
    if (['131', '132', '133', '120', '121'].includes(fromCode)) {
      result.intercompanyReceivables += amount
    }

    // IC borçlar (331 Ortaklara / 332 İştiraklere / 333 Bağlı Ort. / 320-321 Ticari)
    if (['331', '332', '333', '320', '321'].includes(toCode)) {
      result.intercompanyPayables += amount
    }

    // Verilen sipariş avansları (159)
    if (fromCode === '159') {
      result.intercompanyAdvancesGiven += amount
    }

    // Alınan sipariş avansları (340)
    if (toCode === '340') {
      result.intercompanyAdvancesReceived += amount
    }

    // intercompanyProfit: hesap kodu ile otomatik tespit edilemiyor.
    // Stok içi unrealized kâr (153↔600 gibi karmaşık kombinasyonlar) kullanıcı tarafından
    // ayrı bir entry olarak girilmeli veya ilerleyen fazlarda ayrı alan ile desteklenmeli.
  }

  return result
}
