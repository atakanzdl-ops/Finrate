/**
 * SUSTAINABILITY ENGINE (V3-5) — KATMAN KAPSAMI
 *
 * V3-4 (qualityEngine) ile net ayrım:
 * - V3-4 = TEK AKSİYON kalitesi (micro)
 * - V3-5 = PORTFÖY sustainability + ŞİRKET earnings quality (macro)
 *
 * V3-5 aksiyon mikro kalitesine tekrar girmez. Sadece:
 * - Firmanın mevcut gelir kalitesini ölçer
 * - Portföyün bileşik sustainability'sini hesaplar
 * - Repair bonus = portföy firmanın zayıflığını düzeltiyor mu?
 * - Rating ceiling kurallarını uygular
 *
 * Repair bonus ≠ action-level quality bonus.
 * Repair bonus = portföy BAĞLAMINDA sustainability düzeltmesi.
 */

import type {
  ActionTemplateV3,
  Sustainability,
} from './contracts'

import {
  SUSTAINABILITY_MULTIPLIER,
} from './contracts'

import type { QualityResult } from './qualityEngine'

// ─── Input Types ──────────────────────────────────────────────────────────────

/** Firmanın gelir tablosu hesap bakiyeleri (TDHP kodları) */
export interface IncomeStatementBalances {
  /** Hesap kodu → TL tutar */
  accounts: Record<string, number>
  /** Net kâr (590 veya hesaplanmış) */
  netIncome?: number
  /** Toplam gelir (tüm 6xx hesaplar) */
  totalRevenue?: number
}

/** Bir portföy aksiyonunun sustainability analiz input'u */
export interface PortfolioAction {
  template: ActionTemplateV3
  qualityResult: QualityResult
  amountTRY: number
}

export interface SustainabilityAnalysisInput {
  /** Firmanın gelir tablosu */
  incomeStatement: IncomeStatementBalances
  /** Seçilmiş aksiyon portföyü */
  portfolio: PortfolioAction[]
  /** Hedef rating (ceiling kontrolü için) */
  targetRating?: string
  /** Mevcut rating */
  currentRating?: string
}

// ─── Output Types ─────────────────────────────────────────────────────────────

/** Seviye 1: Şirketin mevcut gelir kalitesi */
export interface EarningsQualitySnapshot {
  /** Toplam gelir (6xx) */
  totalRevenue: number
  /** Recurring gelir (600, 601, 602, 604) */
  recurringRevenue: number
  /** Semi-recurring gelir (64x — 649 cap'li) */
  semiRecurringRevenue: number
  /** Non-recurring gelir (67x, 65x enflasyon) */
  nonRecurringRevenue: number

  /** Oranlar */
  recurringRatio: number
  semiRecurringRatio: number
  nonRecurringRatio: number
  /** nonRecurringRevenue / netIncome */
  extraordinaryDependency: number
  /** (655-658 toplamı) / netIncome */
  inflationDependency: number

  /** Genel earnings quality etiketi */
  earningsQualityGrade: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW'

  /** Narrative açıklama */
  narrative: string

  /** Bulgular listesi */
  findings: string[]

  /** Operasyonel nakit sürdürülebilirlik sinyali (V3-8'de derinleşecek) */
  operationalCashSignal: {
    receivablesLagging: boolean
    warnings: string[]
  }
}

export type PortfolioSustainabilityLabel =
  | 'RECURRING_HEAVY'
  | 'MIXED'
  | 'ONE_OFF_HEAVY'
  | 'ACCOUNTING_HEAVY'

/** Seviye 2: Portföy sürdürülebilirlik değerlendirmesi */
export interface PortfolioSustainabilityAssessment {
  totalAdjustedScore: number
  recurringShare: number
  semiRecurringShare: number
  oneOffShare: number
  nonRecurringShare: number
  accountingOnlyShare: number
  weightedSustainabilityScore: number
  label: PortfolioSustainabilityLabel
  narrative: string
  repairBonus: number
  repairBonusReasoning: string[]
}

/** Seviye 3: Rating ceiling kuralları */
export interface SustainabilityConstraints {
  maxAchievableRating: string | null
  hasCeiling: boolean
  ceilingReasons: string[]
  ceilingLiftRequirements: string[]
}

/** Seviye 4: Sustainability Repair Potential */
export interface SustainabilityRepairPotential {
  currentGap: number
  portfolioRepairCoverage: number
  topRepairDrivers: Array<{
    actionId: string
    repairContribution: number
    reasoning: string
  }>
  recommendedAdditions: string[]
}

/** Ana çıktı */
export interface SustainabilityResult {
  earningsSnapshot: EarningsQualitySnapshot
  portfolioAssessment: PortfolioSustainabilityAssessment
  constraints: SustainabilityConstraints
  repairPotential: SustainabilityRepairPotential
  finalSustainabilityScore: number
  executiveSummary: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RECURRING_REVENUE_CODES     = ['600', '601', '602', '604']
const NON_RECURRING_REVENUE_CODES = ['671', '679', '655', '656', '657', '658']

function sumAccountsByPrefixes(
  accounts: Record<string, number>,
  prefixes: string[]
): number {
  let total = 0
  for (const [code, amount] of Object.entries(accounts)) {
    if (prefixes.some(p => code.startsWith(p))) {
      total += Math.abs(amount)
    }
  }
  return total
}

/**
 * Semi-recurring gelirleri özel ağırlıklarla toplar.
 * 649 hesabı kur farkı, valuation veya tek seferlik kalemler içerebilir.
 * Bu yüzden 649'un yalnızca %50'si sayılır.
 */
function sumSemiRecurringWithCaps(
  accounts: Record<string, number>
): { total: number; warnings: string[] } {
  const warnings: string[] = []
  let total = 0

  // Normal semi-recurring hesaplar — tam ağırlık
  const NORMAL_SEMI = ['640', '642', '644', '645', '646']
  for (const [code, amount] of Object.entries(accounts)) {
    if (NORMAL_SEMI.some(p => code.startsWith(p))) {
      total += Math.abs(amount)
    }
  }

  // 649 — kir riski yüksek, %50 cap
  for (const [code, amount] of Object.entries(accounts)) {
    if (code.startsWith('649')) {
      const capped = Math.abs(amount) * 0.50
      total += capped
      if (Math.abs(amount) > 1_000_000) {
        warnings.push(
          `⚠️ 649 hesabı ${(Math.abs(amount) / 1e6).toFixed(1)}M TL — ` +
          `ağırlık %50'ye indirildi (kur farkı, valuation, tek seferlik kalem riski)`
        )
      }
    }
  }

  return { total, warnings }
}

// ─── Level 1: Earnings Quality ────────────────────────────────────────────────

export function analyzeEarningsQuality(
  incomeStatement: IncomeStatementBalances
): EarningsQualitySnapshot {
  const accounts = incomeStatement.accounts
  const findings: string[] = []

  const recurringRevenue    = sumAccountsByPrefixes(accounts, RECURRING_REVENUE_CODES)
  const semiResult          = sumSemiRecurringWithCaps(accounts)
  const semiRecurringRevenue = semiResult.total
  findings.push(...semiResult.warnings)
  const nonRecurringRevenue = sumAccountsByPrefixes(accounts, NON_RECURRING_REVENUE_CODES)
  const totalRevenue = recurringRevenue + semiRecurringRevenue + nonRecurringRevenue

  const recurringRatio      = totalRevenue > 0 ? recurringRevenue / totalRevenue : 0
  const semiRecurringRatio  = totalRevenue > 0 ? semiRecurringRevenue / totalRevenue : 0
  const nonRecurringRatio   = totalRevenue > 0 ? nonRecurringRevenue / totalRevenue : 0

  const netIncome = incomeStatement.netIncome ?? 0
  const extraordinaryDependency =
    netIncome > 0 ? nonRecurringRevenue / netIncome : 0

  // Enflasyon muhasebesi etkisi (655-658)
  const inflationGains = sumAccountsByPrefixes(accounts, ['655', '656', '657', '658'])
  const inflationDependency = netIncome > 0 ? inflationGains / netIncome : 0

  // ── Earnings Quality Grade ─────────────────────────────────────────────────
  let earningsQualityGrade: EarningsQualitySnapshot['earningsQualityGrade']

  if (recurringRatio >= 0.80 && extraordinaryDependency < 0.15) {
    earningsQualityGrade = 'HIGH'
    findings.push('Gelir ağırlıklı ana faaliyetten (>%80 recurring)')
  } else if (recurringRatio >= 0.60 && extraordinaryDependency < 0.30) {
    earningsQualityGrade = 'MEDIUM'
    findings.push(`Orta seviye gelir kalitesi (%60-80 recurring)`)
  } else if (recurringRatio >= 0.40) {
    earningsQualityGrade = 'LOW'
    findings.push(`Düşük gelir kalitesi: ${(recurringRatio * 100).toFixed(0)}% recurring`)
  } else {
    earningsQualityGrade = 'VERY_LOW'
    findings.push(`Çok düşük gelir kalitesi: sadece ${(recurringRatio * 100).toFixed(0)}% recurring`)
  }

  // ── Kritik uyarılar ────────────────────────────────────────────────────────
  if (extraordinaryDependency > 0.30) {
    findings.push(
      `⚠️ Net kârın %${(extraordinaryDependency * 100).toFixed(0)}'i olağandışı gelirden — sürdürülebilir değil`
    )
  }
  if (inflationDependency > 0.20) {
    findings.push(
      `⚠️ Net kârın %${(inflationDependency * 100).toFixed(0)}'i enflasyon muhasebesinden — operasyonel değil`
    )
  }
  if (nonRecurringRatio > 0.25) {
    findings.push(
      `⚠️ Gelirin %${(nonRecurringRatio * 100).toFixed(0)}'i non-recurring — bankacı için zayıf sinyal`
    )
  }

  const narrative = buildEarningsNarrative(
    earningsQualityGrade,
    recurringRatio,
    extraordinaryDependency,
    inflationDependency
  )

  // Operational cash signal (V3-8'de derinleşecek)
  const operationalCashSignal = {
    receivablesLagging: false,
    warnings: [
      'Operasyonel nakit sürdürülebilirlik analizi V3-8 (Asset Productivity) katmanında detaylandırılacak',
    ],
  }

  return {
    totalRevenue,
    recurringRevenue,
    semiRecurringRevenue,
    nonRecurringRevenue,
    recurringRatio,
    semiRecurringRatio,
    nonRecurringRatio,
    extraordinaryDependency,
    inflationDependency,
    earningsQualityGrade,
    narrative,
    findings,
    operationalCashSignal,
  }
}

function buildEarningsNarrative(
  grade: EarningsQualitySnapshot['earningsQualityGrade'],
  recurringRatio: number,
  extraordinaryDep: number,
  inflationDep: number
): string {
  if (grade === 'HIGH') {
    return (
      `Firmanın gelirleri sağlam ana faaliyete dayalı. ` +
      `Recurring gelir oranı %${(recurringRatio * 100).toFixed(0)}, olağandışı gelir bağımlılığı düşük.`
    )
  }
  if (grade === 'MEDIUM') {
    return (
      `Gelir kalitesi orta seviyede. Ana faaliyet belirgin ama yan gelirler de önemli. ` +
      `Recurring %${(recurringRatio * 100).toFixed(0)}.`
    )
  }
  if (grade === 'LOW') {
    return (
      `Gelir kalitesi zayıf. Ana faaliyet geliri %${(recurringRatio * 100).toFixed(0)} ile sınırlı. ` +
      `Olağandışı gelir bağımlılığı %${(extraordinaryDep * 100).toFixed(0)}.`
    )
  }
  // VERY_LOW — inflationDep kullanılıyor; parametreden faydalanıyoruz
  const inflationNote =
    inflationDep > 0.20
      ? ` Enflasyon muhasebesi etkisi: %${(inflationDep * 100).toFixed(0)}.`
      : ''
  return (
    `Gelir kalitesi kritik düşük. Firmanın kârı ağırlıklı olarak non-recurring kalemlere dayanıyor.` +
    `${inflationNote} Bankacı perspektifiyle sürdürülebilir değil.`
  )
}

// ─── Level 2: Portfolio Sustainability ────────────────────────────────────────

export function assessPortfolioSustainability(
  portfolio: PortfolioAction[],
  earnings: EarningsQualitySnapshot
): PortfolioSustainabilityAssessment {
  const totalAdjustedScore = portfolio.reduce(
    (sum, p) => sum + Math.abs(p.qualityResult.adjustedScoreDelta),
    0
  )

  if (totalAdjustedScore === 0) {
    return {
      totalAdjustedScore: 0,
      recurringShare: 0,
      semiRecurringShare: 0,
      oneOffShare: 0,
      nonRecurringShare: 0,
      accountingOnlyShare: 0,
      weightedSustainabilityScore: 0,
      label: 'MIXED',
      narrative: 'Portföyde anlamlı aksiyon yok',
      repairBonus: 0,
      repairBonusReasoning: [],
    }
  }

  // ── Sustainability paylarını hesapla (|adjustedScoreDelta| ağırlıklı) ───────
  const shares: Record<Sustainability, number> = {
    RECURRING: 0,
    SEMI_RECURRING: 0,
    ONE_OFF: 0,
    NON_RECURRING: 0,
    ACCOUNTING_ONLY: 0,
  }

  for (const p of portfolio) {
    const weight = Math.abs(p.qualityResult.adjustedScoreDelta) / totalAdjustedScore
    shares[p.template.sustainability] += weight
  }

  // Ağırlıklı sustainability skoru
  let weightedSustainabilityScore = 0
  for (const [sust, share] of Object.entries(shares) as [Sustainability, number][]) {
    weightedSustainabilityScore += share * SUSTAINABILITY_MULTIPLIER[sust]
  }

  const recurringShare      = shares.RECURRING
  const semiRecurringShare  = shares.SEMI_RECURRING
  const oneOffShare         = shares.ONE_OFF
  const nonRecurringShare   = shares.NON_RECURRING
  const accountingOnlyShare = shares.ACCOUNTING_ONLY
  const totalRecurring      = recurringShare + semiRecurringShare

  // ── Label ──────────────────────────────────────────────────────────────────
  // accounting_heavy kontrol: accountingOnly payı recurringShare'i geçerse veya
  // %25 üstündeyse özel alarm
  let label: PortfolioSustainabilityLabel
  if (
    (accountingOnlyShare > recurringShare && accountingOnlyShare > 0.25) ||
    accountingOnlyShare > 0.40
  ) {
    label = 'ACCOUNTING_HEAVY'
  } else if (oneOffShare + nonRecurringShare > 0.40) {
    label = 'ONE_OFF_HEAVY'
  } else if (totalRecurring > 0.60) {
    label = 'RECURRING_HEAVY'
  } else {
    label = 'MIXED'
  }

  // ── Repair bonus ───────────────────────────────────────────────────────────
  const { repairBonus, reasoning } = calculateRepairBonus(
    earnings,
    label,
    recurringShare,
    accountingOnlyShare
  )

  const narrative = buildPortfolioNarrative(label, recurringShare, oneOffShare, accountingOnlyShare)

  return {
    totalAdjustedScore,
    recurringShare,
    semiRecurringShare,
    oneOffShare,
    nonRecurringShare,
    accountingOnlyShare,
    weightedSustainabilityScore,
    label,
    narrative,
    repairBonus,
    repairBonusReasoning: reasoning,
  }
}

function calculateRepairBonus(
  earnings: EarningsQualitySnapshot,
  portfolioLabel: PortfolioSustainabilityLabel,
  recurringShare: number,
  accountingOnlyShare: number
): { repairBonus: number; reasoning: string[] } {
  const reasoning: string[] = []
  let bonus = 0

  // Pozitif — portföy firma zayıflığını düzeltiyor
  if (earnings.recurringRatio < 0.50 && recurringShare > 0.50) {
    bonus += 0.10
    reasoning.push(
      `✓ Firma gelir kalitesi zayıf (%${(earnings.recurringRatio * 100).toFixed(0)} recurring), ` +
      `portföy bunu düzeltiyor (+0.10)`
    )
  }
  if (earnings.extraordinaryDependency > 0.30 && recurringShare > 0.50) {
    bonus += 0.05
    reasoning.push(
      `✓ Olağandışı gelir bağımlılığı yüksek, portföy recurring gelir yaratıyor (+0.05)`
    )
  }

  // Negatif — portföy zayıflığı örtbas ediyor
  if (
    (earnings.earningsQualityGrade === 'LOW' || earnings.earningsQualityGrade === 'VERY_LOW') &&
    portfolioLabel === 'ACCOUNTING_HEAVY'
  ) {
    bonus -= 0.15
    reasoning.push(
      `✗ Gelir kalitesi zaten zayıf, portföy muhasebesel düzeltmelere yaslanıyor — makyaj sinyali (-0.15)`
    )
  }
  if (
    (earnings.earningsQualityGrade === 'LOW' || earnings.earningsQualityGrade === 'VERY_LOW') &&
    portfolioLabel === 'ONE_OFF_HEAVY'
  ) {
    bonus -= 0.10
    reasoning.push(
      `✗ Gelir kalitesi zayıf, portföy one-off aksiyonlara dayalı — geçici iyileşme (-0.10)`
    )
  }
  if (earnings.recurringRatio > 0.70 && portfolioLabel === 'ACCOUNTING_HEAVY') {
    bonus -= 0.05
    reasoning.push(
      `✗ Gerçek gelir güçlü ama portföy muhasebesel — fırsat kaçırılıyor (-0.05)`
    )
  }

  // Suppress unused-param lint: accountingOnlyShare kullanılıyor
  void accountingOnlyShare

  bonus = Math.max(-0.15, Math.min(0.15, bonus))
  return { repairBonus: bonus, reasoning }
}

function buildPortfolioNarrative(
  label: PortfolioSustainabilityLabel,
  recurringShare: number,
  oneOffShare: number,
  accountingOnlyShare: number
): string {
  switch (label) {
    case 'RECURRING_HEAVY':
      return (
        `Portföy kalıcı iyileşme odaklı. ` +
        `Önerilen aksiyonların %${(recurringShare * 100).toFixed(0)}'i sürdürülebilir yapıda.`
      )
    case 'MIXED':
      return (
        `Portföy karma yapıda. Kalıcı ve geçici iyileşmeler dengeli, ` +
        `ancak bankacı perspektifiyle daha fazla recurring aksiyon tercih edilir.`
      )
    case 'ONE_OFF_HEAVY':
      return (
        `⚠️ Portföy tek seferlik aksiyonlara yaslanıyor (%${(oneOffShare * 100).toFixed(0)} one-off). ` +
        `Rating iyileşmesi geçici olabilir.`
      )
    case 'ACCOUNTING_HEAVY':
      return (
        `⚠️ Portföy muhasebesel düzeltmelere dayanıyor (%${(accountingOnlyShare * 100).toFixed(0)}). ` +
        `Bu tür iyileşme bankacı gözünde sınırlı güven verir.`
      )
  }
}

// ─── Level 3: Rating Sustainability Constraints ───────────────────────────────

export function calculateSustainabilityConstraints(
  earnings: EarningsQualitySnapshot,
  portfolio: PortfolioSustainabilityAssessment,
  targetRating?: string
): SustainabilityConstraints {
  // targetRating future-proof — şimdilik ceiling hesabında kullanılmıyor
  void targetRating

  const ceilingReasons: string[] = []
  const liftRequirements: string[] = []

  // Kural 1: VERY_LOW earnings quality → max CCC
  if (earnings.earningsQualityGrade === 'VERY_LOW') {
    ceilingReasons.push(
      `Firmanın gelir kalitesi çok düşük: recurring %${(earnings.recurringRatio * 100).toFixed(0)}`
    )
    liftRequirements.push(`Recurring gelir oranını en az %60'a çıkarmak gerekli`)
    return buildConstraintResult('CCC', ceilingReasons, liftRequirements)
  }

  // Kural 2: LOW earnings + ACCOUNTING_HEAVY portfolio → max B
  if (
    earnings.earningsQualityGrade === 'LOW' &&
    portfolio.label === 'ACCOUNTING_HEAVY'
  ) {
    ceilingReasons.push('Zayıf gelir kalitesi + muhasebesel odaklı portföy kombinasyonu')
    liftRequirements.push(
      `Operasyonel aksiyon (A18 net satış, A12 brüt marj) eklemek gerekli`
    )
    return buildConstraintResult('B', ceilingReasons, liftRequirements)
  }

  // Kural 3: Olağandışı gelir bağımlılığı > %40 → max B
  if (earnings.extraordinaryDependency > 0.40) {
    ceilingReasons.push(
      `Net kârın %${(earnings.extraordinaryDependency * 100).toFixed(0)}'i olağandışı gelirden`
    )
    liftRequirements.push(
      `Operasyonel kârı (690) güçlendirmek, olağandışı gelir bağımlılığını <%30'a düşürmek`
    )
    return buildConstraintResult('B', ceilingReasons, liftRequirements)
  }

  // Kural 4: ONE_OFF_HEAVY + LOW earnings → max BB
  if (
    portfolio.label === 'ONE_OFF_HEAVY' &&
    earnings.earningsQualityGrade === 'LOW'
  ) {
    ceilingReasons.push('Portföy one-off ağırlıklı, firma gelir kalitesi zayıf')
    liftRequirements.push(
      `Portföye en az 2 RECURRING aksiyon (A12/A13/A14/A18) eklemek`
    )
    return buildConstraintResult('BB', ceilingReasons, liftRequirements)
  }

  // Kural 5: Enflasyon bağımlılığı > %30 → max BB
  if (earnings.inflationDependency > 0.30) {
    ceilingReasons.push(
      `Kârın %${(earnings.inflationDependency * 100).toFixed(0)}'i enflasyon muhasebesinden`
    )
    liftRequirements.push(
      `Operasyonel kâr oluşturmak, enflasyon etkisinden bağımsız gelir kanıtlamak`
    )
    return buildConstraintResult('BB', ceilingReasons, liftRequirements)
  }

  // Tavan yok
  return {
    maxAchievableRating: null,
    hasCeiling: false,
    ceilingReasons: [],
    ceilingLiftRequirements: [],
  }
}

function buildConstraintResult(
  maxRating: string,
  reasons: string[],
  requirements: string[]
): SustainabilityConstraints {
  return {
    maxAchievableRating: maxRating,
    hasCeiling: true,
    ceilingReasons: reasons,
    ceilingLiftRequirements: requirements,
  }
}

// ─── Level 4: Repair Potential ────────────────────────────────────────────────

export function calculateRepairPotential(
  earnings: EarningsQualitySnapshot,
  portfolio: PortfolioAction[],
  portfolioAssessment: PortfolioSustainabilityAssessment
): SustainabilityRepairPotential {
  // currentGap: firmanın sustainability açığı [0,1]
  const currentGap = Math.max(
    0,
    Math.min(1, (1 - earnings.recurringRatio) * 0.5 + earnings.extraordinaryDependency * 0.5)
  )

  // portfolioRepairCoverage: portföyün açığı kapama kapasitesi
  const portfolioRepairCoverage = Math.min(
    1,
    portfolioAssessment.recurringShare * 0.8 + portfolioAssessment.semiRecurringShare * 0.4
  )

  // En iyi repair driver'lar (RECURRING + SEMI_RECURRING aksiyonlar)
  const repairDrivers = portfolio
    .filter(p => {
      const s = p.template.sustainability
      return s === 'RECURRING' || s === 'SEMI_RECURRING'
    })
    .map(p => ({
      actionId: p.template.id,
      repairContribution:
        Math.abs(p.qualityResult.adjustedScoreDelta) *
        SUSTAINABILITY_MULTIPLIER[p.template.sustainability],
      reasoning: `${p.template.name} — ${p.template.sustainability} etkili aksiyon`,
    }))
    .sort((a, b) => b.repairContribution - a.repairContribution)
    .slice(0, 3)

  // Eksik olanlara öneri
  const portfolioIds = new Set(portfolio.map(p => p.template.id))
  const recommendedAdditions: string[] = []

  if (earnings.recurringRatio < 0.50 && !portfolioIds.has('A18_NET_SALES_GROWTH')) {
    recommendedAdditions.push(
      'A18_NET_SALES_GROWTH — Net satış artışı recurring gelir yaratır'
    )
  }
  if (earnings.recurringRatio < 0.50 && !portfolioIds.has('A12_GROSS_MARGIN_IMPROVEMENT')) {
    recommendedAdditions.push(
      'A12_GROSS_MARGIN_IMPROVEMENT — Brüt marj iyileştirme sürdürülebilir kâr'
    )
  }
  if (earnings.extraordinaryDependency > 0.30 && !portfolioIds.has('A13_OPEX_OPTIMIZATION')) {
    recommendedAdditions.push(
      'A13_OPEX_OPTIMIZATION — Operasyonel kâr güçlendirme'
    )
  }

  return {
    currentGap,
    portfolioRepairCoverage,
    topRepairDrivers: repairDrivers,
    recommendedAdditions,
  }
}

// ─── Ana API ──────────────────────────────────────────────────────────────────

/**
 * 4 katmanlı sürdürülebilirlik analizi:
 * 1. Earnings Quality Snapshot — firmanın gelir kalitesi
 * 2. Portfolio Sustainability  — portföyün bileşik sürdürülebilirliği
 * 3. Rating Ceiling            — sustainability bazlı rating tavan kuralları
 * 4. Repair Potential          — portföy açığı kapatıyor mu?
 */
export function analyzeSustainability(
  input: SustainabilityAnalysisInput
): SustainabilityResult {
  const earningsSnapshot = analyzeEarningsQuality(input.incomeStatement)

  const portfolioAssessment = assessPortfolioSustainability(
    input.portfolio,
    earningsSnapshot
  )

  const constraints = calculateSustainabilityConstraints(
    earningsSnapshot,
    portfolioAssessment,
    input.targetRating
  )

  const repairPotential = calculateRepairPotential(
    earningsSnapshot,
    input.portfolio,
    portfolioAssessment
  )

  const finalSustainabilityScore = Math.max(
    0,
    Math.min(
      1,
      portfolioAssessment.weightedSustainabilityScore + portfolioAssessment.repairBonus
    )
  )

  const executiveSummary = buildExecutiveSummary(
    earningsSnapshot,
    portfolioAssessment,
    constraints,
    finalSustainabilityScore
  )

  return {
    earningsSnapshot,
    portfolioAssessment,
    constraints,
    repairPotential,
    finalSustainabilityScore,
    executiveSummary,
  }
}

function buildExecutiveSummary(
  earnings: EarningsQualitySnapshot,
  portfolio: PortfolioSustainabilityAssessment,
  constraints: SustainabilityConstraints,
  finalScore: number
): string {
  const parts: string[] = []

  parts.push(
    `Gelir Kalitesi: ${earnings.earningsQualityGrade} (recurring %${(earnings.recurringRatio * 100).toFixed(0)})`
  )
  parts.push(`Portföy Tipi: ${portfolio.label}`)
  parts.push(`Sustainability Skoru: ${(finalScore * 100).toFixed(0)}/100`)

  if (constraints.hasCeiling) {
    parts.push(
      `⚠️ Rating Tavan: ${constraints.maxAchievableRating} (${constraints.ceilingReasons[0]})`
    )
  }

  return parts.join(' | ')
}

/**
 * GELECEKTEKİ İYİLEŞTİRMELER (V3-8/V3-9'da uygulanacak):
 *
 * 1. Enflasyon normalization layer — 648/649/679 içine gömülü enflasyon etkilerini
 *    ayrıştırmak. Şu an basit 655-658 hesaplanıyor ama gerçek enflasyon etkisi
 *    daha karmaşık dağılımda.
 *
 * 2. Multi-factor weighted ceiling — Şu an tek trigger → ceiling.
 *    Gerçekte çok faktörlü weighted ceiling daha doğru:
 *      - very low recurring → CCC
 *      - accounting heavy + weak ops → B
 *      - one-off heavy ama güçlü EBITDA → BB olabilir
 *
 * 3. Bounded weighted blend — Şu an finalSustainabilityScore lineer toplama.
 *    Önerilen: 0.8 × weightedScore + 0.2 × normalizedRepair
 *
 * 4. Operational cash sustainability — Satış var ama tahsil yok, EBITDA var ama
 *    cash yok gibi durumlar. V3-8 asset productivity katmanında detaylandırılacak.
 */
