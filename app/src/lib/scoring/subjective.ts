/**
 * Finrate — Subjektif Skor Motoru (max 30 puan)
 *
 * Finskor'un 75+30 sistemine benzer ancak daha kapsamlı:
 *  - KKB & Kredi Sicili    : 10 puan
 *  - Banka İlişkileri      : 10 puan
 *  - Kurumsal Yapı         :  5 puan
 *  - Uyum & Risk           :  5 puan
 *  Toplam                  : 30 puan
 */

export interface SubjectiveInputData {
  kkbCategory?: string        // iyi | orta | kotu | cok_kotu
  activeDelayDays?: number    // 0=yok | 30=1-30 | 90=31-90 | 999=90+
  checkProtest?: boolean
  enforcementFile?: boolean
  creditLimitUtilPct?: number // 0-100
  hasMultipleBanks?: boolean
  avgMaturityMonths?: number
  companyAgeYears?: number
  auditLevel?: string         // yok | smmm | ymm | tam_tasdik | bagimsiz
  ownershipClarity?: boolean
  hasTaxDebt?: boolean
  hasSgkDebt?: boolean
  activeLawsuitCount?: number
}

export interface SubjectiveBreakdown {
  kkbScore: number        // /10
  bankScore: number       // /10
  corpScore: number       // /5
  complianceScore: number // /5
  total: number           // /30
  percentage: number      // 0-100
  subjectiveDataMissing: boolean
}

export function calcSubjectiveScore(s: SubjectiveInputData): SubjectiveBreakdown {
  // Tüm alanlar boşsa veri girilmemiş sayılır
  const subjectiveDataMissing =
    s.kkbCategory == null &&
    s.activeDelayDays == null &&
    s.checkProtest == null &&
    s.enforcementFile == null &&
    s.creditLimitUtilPct == null &&
    s.hasMultipleBanks == null &&
    s.avgMaturityMonths == null &&
    s.companyAgeYears == null &&
    s.auditLevel == null &&
    s.ownershipClarity == null &&
    s.hasTaxDebt == null &&
    s.hasSgkDebt == null &&
    s.activeLawsuitCount == null

  // ─── KKB & Kredi Sicili (max 10) ──────────────────────────
  let kkb = 0

  // KKB kategorisi (7 puan) — iyi+gecikme yok = 10/10 mümkün
  const kkbMap: Record<string, number> = { iyi: 7, orta: 4, kotu: 1, cok_kotu: 0 }
  kkb += kkbMap[s.kkbCategory ?? 'orta'] ?? 4

  // Gecikme durumu (3 puan)
  const delay = s.activeDelayDays ?? 30
  kkb += delay === 0 ? 3 : delay <= 30 ? 1 : 0

  // Çek protestosu ve icra cezaları
  if (s.checkProtest) kkb -= 2
  if (s.enforcementFile) kkb -= 3

  const kkbScore = Math.max(0, Math.min(10, kkb))

  // ─── Banka İlişkileri (max 10) ────────────────────────────
  let bank = 0

  // Limit kullanım oranı (5 puan)
  const util = s.creditLimitUtilPct ?? 70
  bank += util < 30 ? 5 : util < 50 ? 4 : util < 70 ? 3 : util < 85 ? 1 : 0

  // Çok bankacılık ilişkisi (2 puan)
  if (s.hasMultipleBanks) bank += 2

  // Ortalama vade uzunluğu (3 puan — uzun vade daha az risk)
  const maturity = s.avgMaturityMonths ?? 6
  bank += maturity >= 36 ? 3 : maturity >= 24 ? 2 : maturity >= 12 ? 1 : 0

  const bankScore = Math.max(0, Math.min(10, bank))

  // ─── Kurumsal Yapı (max 5) ────────────────────────────────
  let corp = 0

  // Şirket yaşı (2 puan)
  const age = s.companyAgeYears ?? 3
  corp += age >= 10 ? 2 : age >= 5 ? 1 : 0

  // Denetim düzeyi (3 puan)
  const auditMap: Record<string, number> = {
    yok: 0, smmm: 0, ymm: 1, tam_tasdik: 2, bagimsiz: 3
  }
  corp += auditMap[s.auditLevel ?? 'ymm'] ?? 1

  // Ortaklık yapısı netliği bonus
  // (ownershipClarity zaten default true, ek puan vermiyoruz)

  const corpScore = Math.max(0, Math.min(5, corp))

  // ─── Uyum & Risk (max 5) ──────────────────────────────────
  let compliance = 5
  if (s.hasTaxDebt)   compliance -= 2
  if (s.hasSgkDebt)   compliance -= 1
  const lawsuits = s.activeLawsuitCount ?? 0
  compliance -= lawsuits >= 3 ? 2 : lawsuits >= 1 ? 1 : 0

  const complianceScore = Math.max(0, Math.min(5, compliance))

  const total = kkbScore + bankScore + corpScore + complianceScore
  const percentage = (total / 30) * 100

  return { kkbScore, bankScore, corpScore, complianceScore, total, percentage, subjectiveDataMissing }
}

/**
 * Finansal skor (0-100) + Subjektif (0-30) → Birleşik skor (0-100)
 *
 * CEILING (tavan) — lineer interpolasyon:
 *   finansal  0–35  → ceiling = 43 + (f / 35) × 9          (43 → 52)
 *   finansal 35–55  → ceiling = 52 + ((f − 35) / 20) × 15  (52 → 67)
 *   finansal 55+    → ceiling yok
 *
 * FLOOR (taban) — lineer interpolasyon:
 *   finansal 55–65  → floor = 44 + ((f − 55) / 10) × 8     (44 → 52)
 *   finansal 65–68  → floor = 52 + ((f − 65) / 3)  × 8     (52 → 60)
 *   finansal 68–80  → floor = 60  (sabit)
 *   finansal 80+    → floor = 64
 *   finansal 55 altı → floor yok
 */
export function combineScores(financialScore: number, subjectiveTotal: number): number {
  let combined = Math.min(100, Math.round(financialScore * 0.70 + subjectiveTotal))

  // ── Ceiling (lineer) ────────────────────────────────────────
  if (financialScore <= 35) {
    const ceiling = 43 + (financialScore / 35) * 9
    combined = Math.min(combined, Math.round(ceiling))
  } else if (financialScore < 55) {
    const ceiling = 52 + ((financialScore - 35) / 20) * 15
    combined = Math.min(combined, Math.round(ceiling))
  }
  // finansalScore >= 55 → ceiling yok

  // ── Floor (lineer) — ceiling sonrası uygulanır ──────────────
  if (financialScore >= 80) {
    combined = Math.max(combined, 64)
  } else if (financialScore >= 68) {
    combined = Math.max(combined, 60)
  } else if (financialScore >= 65) {
    const floor = 52 + ((financialScore - 65) / 3) * 8
    combined = Math.max(combined, Math.round(floor))
  } else if (financialScore >= 55) {
    const floor = 44 + ((financialScore - 55) / 10) * 8
    combined = Math.max(combined, Math.round(floor))
  }
  // finansalScore < 55 → floor yok

  return combined
}
