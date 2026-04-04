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
}

export function calcSubjectiveScore(s: SubjectiveInputData): SubjectiveBreakdown {
  // ─── KKB & Kredi Sicili (max 10) ──────────────────────────
  let kkb = 0

  // KKB kategorisi (5 puan)
  const kkbMap: Record<string, number> = { iyi: 5, orta: 3, kotu: 1, cok_kotu: 0 }
  kkb += kkbMap[s.kkbCategory ?? 'orta'] ?? 3

  // Gecikme durumu (3 puan)
  const delay = s.activeDelayDays ?? 0
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

  return { kkbScore, bankScore, corpScore, complianceScore, total, percentage }
}

/**
 * Finansal skor (0-100) + subjektif skor (0-30) → birleşik final skor
 * Ağırlık: Finansal %75, Subjektif %25
 */
export function combineScores(financialScore: number, subjectiveTotal: number): number {
  const subjectivePct = (subjectiveTotal / 30) * 100
  return financialScore * 0.75 + subjectivePct * 0.25
}
