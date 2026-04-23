import type {
  AccountMovement, AccountLine, ActionEffect,
  DistributionMode, SixGroupAnalysis, RatioCode, GroupCode,
  MeaningfulImpactThresholds,
} from './contracts'
import { DEFAULT_THRESHOLDS, DEFAULT_SHOCK_GUARDRAILS } from './contracts'
import type { ActionCandidate } from './candidateGenerator'
import { buildSixGroupAnalysis } from './analyzer'
import { calculateRatiosFromAccounts } from '../ratios'
import { getActionFamily } from './actionFamilies'

/**
 * Dağıtım kuralı uygulayarak her kaynak hesabın ne kadarını kullanacağını belirler.
 */
function distributeAmount(
  sources: AccountLine[],
  totalAmount: number,
  mode: DistributionMode
): { code: string; amount: number }[] {
  if (sources.length === 0 || totalAmount <= 0) return []

  const totalAvailable = sources.reduce((s, l) => s + Math.abs(l.amount), 0)
  if (totalAvailable <= 0) return []

  const safeAmount = Math.min(totalAmount, totalAvailable)

  if (mode === "LARGEST_FIRST") {
    // En büyükten başlayıp dolduruyor
    const sorted = [...sources].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    const result: { code: string; amount: number }[] = []
    let remaining = safeAmount

    for (const line of sorted) {
      if (remaining <= 0) break
      const available = Math.abs(line.amount)
      const take = Math.min(remaining, available)
      if (take > 0) {
        result.push({ code: line.accountCode, amount: take })
        remaining -= take
      }
    }
    return result
  }

  if (mode === "PROPORTIONAL") {
    // Her hesaba bakiyesi oranında
    return sources
      .filter(l => l.amount !== 0)
      .map(l => ({
        code: l.accountCode,
        amount: safeAmount * (Math.abs(l.amount) / totalAvailable),
      }))
  }

  // HYBRID_70_30: %70 en büyüğe, %30 tüm kalemlere oransal
  const sorted = [...sources].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const largestAmount = safeAmount * 0.70
  const proportionalAmount = safeAmount * 0.30

  const result: { code: string; amount: number }[] = []

  // %70 en büyüğe
  if (sorted[0]) {
    const take = Math.min(largestAmount, Math.abs(sorted[0].amount))
    result.push({ code: sorted[0].accountCode, amount: take })
  }

  // %30 oransal — zaten en büyüğe verilen kalemin kalan kapasitesini de kullanabilir
  for (const line of sources) {
    if (line.amount === 0) continue
    const share = Math.abs(line.amount) / totalAvailable
    const take = proportionalAmount * share
    if (take > 0) {
      // Varsa mevcut kaydı güncelle
      const existing = result.find(r => r.code === line.accountCode)
      if (existing) {
        existing.amount += take
      } else {
        result.push({ code: line.accountCode, amount: take })
      }
    }
  }

  return result
}

/**
 * Hedef hesaplara tutarı dağıtır.
 * Eğer hedef hesapların kendi bakiyesi yoksa (örn. A10'da 500'e eklerken 500 boş olabilir),
 * basit olarak ilk mapping'e yazar.
 */
function distributeTargets(
  targets: AccountLine[],
  template: ActionCandidate['template'],
  totalAmount: number
): { code: string; amount: number }[] {
  if (targets.length > 0) {
    // Mevcut hedef hesapların bakiyeleri varsa oransal dağıt
    const totalAvailable = targets.reduce((s, l) => s + Math.abs(l.amount), 0)

    if (totalAvailable > 0) {
      return targets.map(l => ({
        code: l.accountCode,
        amount: totalAmount * (Math.abs(l.amount) / totalAvailable),
      }))
    }
  }

  // Hedef hesap yoksa mapping'deki ilk target prefix'i kullan
  const firstTargetPrefix = template.accountMappings[0]?.targetAccountPrefixes[0]
  if (!firstTargetPrefix || firstTargetPrefix === "EXTERNAL") return []

  return [{ code: firstTargetPrefix, amount: totalAmount }]
}

/**
 * Aksiyonu uygular, hareketleri üretir, önce/sonra rasyoları hesaplar.
 */
export function applyCandidate(
  analysis: SixGroupAnalysis,
  candidate: ActionCandidate,
  amount: number,
  sector: string,
  thresholds: MeaningfulImpactThresholds = DEFAULT_THRESHOLDS
): ActionEffect {
  const warnings: string[] = []
  const constraintsTriggered: string[] = []

  const clampedAmount = Math.max(
    candidate.amountMin,
    Math.min(amount, candidate.amountMax)
  )

  // A10 EXTERNAL source — sadece hedef hareketleri var
  const isExternalSource = candidate.template.sourceGroup === "EXTERNAL"

  let sourceMovements: { code: string; amount: number }[] = []
  if (!isExternalSource) {
    sourceMovements = distributeAmount(
      candidate.eligibleSourceAccounts,
      clampedAmount,
      candidate.distributionMode
    )

    if (sourceMovements.length === 0) {
      warnings.push("Kaynak hesaplarda yeterli bakiye bulunamadı")
    }
  }

  const targetMovements = distributeTargets(
    candidate.eligibleTargetAccounts,
    candidate.template,
    clampedAmount
  )

  // AccountMovement[] — kaynak azalır (negatif), hedef artar (pozitif)
  // A10 için hedef positive, source zaten external (kayıt yok); EXTERNAL durumunda
  // kasa (102) da aynı anda artmalı
  const accountMovements: AccountMovement[] = []

  for (const sm of sourceMovements) {
    accountMovements.push({ accountCode: sm.code, delta: -sm.amount })
  }

  for (const tm of targetMovements) {
    accountMovements.push({ accountCode: tm.code, delta: +tm.amount })
  }

  // A10 EXTERNAL kaynaklı: hem ödenmiş sermaye (500) hem kasa (102) artar
  if (isExternalSource) {
    accountMovements.push({ accountCode: "102", delta: +clampedAmount })
  }

  // Bilançoya uygula
  const accountsMap = new Map<string, number>()
  for (const acc of analysis.accounts) {
    accountsMap.set(acc.accountCode, (accountsMap.get(acc.accountCode) ?? 0) + acc.amount)
  }

  for (const mv of accountMovements) {
    const prev = accountsMap.get(mv.accountCode) ?? 0
    accountsMap.set(mv.accountCode, prev + mv.delta)
  }

  const updatedAccounts = Array.from(accountsMap.entries())
    .filter(([, amt]) => amt !== 0)
    .map(([accountCode, amount]) => ({ accountCode, amount }))

  // Önce/sonra rasyolar
  const ratiosBeforeRaw = calculateRatiosFromAccounts(
    analysis.accounts.map(a => ({ accountCode: a.accountCode, amount: a.amount }))
  )
  const ratiosAfterRaw = calculateRatiosFromAccounts(updatedAccounts)

  const beforeRatios: Record<RatioCode, number> = {
    CURRENT_RATIO: ratiosBeforeRaw.currentRatio ?? 0,
    QUICK_RATIO: ratiosBeforeRaw.quickRatio ?? 0,
    CASH_RATIO: ratiosBeforeRaw.cashRatio ?? 0,
    NET_WORKING_CAPITAL_RATIO: ratiosBeforeRaw.netWorkingCapitalRatio ?? 0,
    DEBT_TO_EQUITY: ratiosBeforeRaw.debtToEquity ?? 0,
    EQUITY_RATIO: ratiosBeforeRaw.equityRatio ?? 0,
    INTEREST_COVERAGE: ratiosBeforeRaw.interestCoverage ?? 0,
    NET_DEBT_TO_EBITDA: ((ratiosBeforeRaw as unknown) as Record<string, number | null>)['netDebtToEbitda'] ?? 0,
  }

  const afterRatios: Record<RatioCode, number> = {
    CURRENT_RATIO: ratiosAfterRaw.currentRatio ?? 0,
    QUICK_RATIO: ratiosAfterRaw.quickRatio ?? 0,
    CASH_RATIO: ratiosAfterRaw.cashRatio ?? 0,
    NET_WORKING_CAPITAL_RATIO: ratiosAfterRaw.netWorkingCapitalRatio ?? 0,
    DEBT_TO_EQUITY: ratiosAfterRaw.debtToEquity ?? 0,
    EQUITY_RATIO: ratiosAfterRaw.equityRatio ?? 0,
    INTEREST_COVERAGE: ratiosAfterRaw.interestCoverage ?? 0,
    NET_DEBT_TO_EBITDA: ((ratiosAfterRaw as unknown) as Record<string, number | null>)['netDebtToEbitda'] ?? 0,
  }

  const ratioDelta: Record<RatioCode, number> = {} as Record<RatioCode, number>
  for (const code of Object.keys(beforeRatios) as RatioCode[]) {
    ratioDelta[code] = afterRatios[code] - beforeRatios[code]
  }

  // Group delta — önce/sonra 6 grup
  const afterAnalysis = buildSixGroupAnalysis(updatedAccounts, {
    companyId: analysis.companyId,
    scenarioId: analysis.scenarioId,
    sector,
  })

  const groupDelta: Record<Exclude<GroupCode, "EXTERNAL">, number> = {
    CURRENT_ASSETS: afterAnalysis.groups.CURRENT_ASSETS.total - analysis.groups.CURRENT_ASSETS.total,
    NON_CURRENT_ASSETS: afterAnalysis.groups.NON_CURRENT_ASSETS.total - analysis.groups.NON_CURRENT_ASSETS.total,
    SHORT_TERM_LIABILITIES: afterAnalysis.groups.SHORT_TERM_LIABILITIES.total - analysis.groups.SHORT_TERM_LIABILITIES.total,
    LONG_TERM_LIABILITIES: afterAnalysis.groups.LONG_TERM_LIABILITIES.total - analysis.groups.LONG_TERM_LIABILITIES.total,
    EQUITY: afterAnalysis.groups.EQUITY.total - analysis.groups.EQUITY.total,
    INCOME_STATEMENT: afterAnalysis.groups.INCOME_STATEMENT.total - analysis.groups.INCOME_STATEMENT.total,
  }

  // ───────────────────────────────────────────────
  // Fix E: Şok Guardrail — tek aksiyon bilanço şoku kontrolü
  // ───────────────────────────────────────────────
  const shockViolations: string[] = []
  const shockGroups = [
    'CURRENT_ASSETS', 'NON_CURRENT_ASSETS',
    'SHORT_TERM_LIABILITIES', 'LONG_TERM_LIABILITIES', 'EQUITY',
  ] as const

  for (const g of shockGroups) {
    const before = Math.abs(analysis.groups[g].total)
    const delta  = Math.abs(groupDelta[g])
    if (before > 0 && delta / before > DEFAULT_SHOCK_GUARDRAILS.maxGroupChangePct) {
      shockViolations.push(
        `${g}: %${(delta / before * 100).toFixed(1)} > %${(DEFAULT_SHOCK_GUARDRAILS.maxGroupChangePct * 100).toFixed(0)}`
      )
    }
  }

  // Toplam aktif değişimi
  const totalAssetsDelta = Math.abs(afterAnalysis.totals.assets - analysis.totals.assets)
  if (
    analysis.totals.assets > 0 &&
    totalAssetsDelta / analysis.totals.assets > DEFAULT_SHOCK_GUARDRAILS.maxTotalAssetChangePct
  ) {
    shockViolations.push(
      `TOTAL_ASSETS: %${(totalAssetsDelta / analysis.totals.assets * 100).toFixed(1)} > %${(DEFAULT_SHOCK_GUARDRAILS.maxTotalAssetChangePct * 100).toFixed(0)}`
    )
  }

  if (shockViolations.length > 0) {
    constraintsTriggered.push("SHOCK_GUARDRAIL")
    warnings.push(`Şok guardrail ihlali: ${shockViolations.join('; ')}`)

    // Hard reject — score 0, erken dön
    const targetGroupForImpact = candidate.template.targetGroup !== 'EXTERNAL'
      ? analysis.groups[candidate.template.targetGroup as Exclude<GroupCode, 'EXTERNAL'>]
      : null
    const tgImpact = targetGroupForImpact && Math.abs(targetGroupForImpact.total) > 0
      ? clampedAmount / Math.abs(targetGroupForImpact.total)
      : null
    const bsImpact = analysis.totals.assets > 0
      ? clampedAmount / analysis.totals.assets
      : null

    return {
      schemaVersion: "1.0.0",
      scenarioId: analysis.scenarioId,
      actionId: candidate.actionId,
      distributionModeApplied: candidate.distributionMode,
      amountRequested: amount,
      amountApplied: clampedAmount,
      beforeRatios,
      afterRatios,
      ratioDelta,
      groupDelta,
      accountMovements,
      constraintsTriggered,
      warnings,
      scoreBreakdown: {
        materiality: 0,
        manageability: 0,
        costScore: 0,
        feasibilityMultiplier: candidate.feasibilityMultiplier,
        impactMultiplier: 0,
        confidenceMultiplier: candidate.template.confidence,
        finalPriorityScore: 0,
      },
      ...(tgImpact !== null && { targetGroupImpact: tgImpact }),
      ...(bsImpact !== null && { balanceSheetImpact: bsImpact }),
      bindingCap: candidate.bindingCap ?? null,
    }
  }

  // ───────────────────────────────────────────────
  // Aşama 5a-5: Aksiyon ailesine göre minimal impact
  // ───────────────────────────────────────────────

  // Parasal NİS override hesabı — tüm aileler için ortak
  const donenVarliklarBefore = analysis.groups.CURRENT_ASSETS.total
  const kvykBefore = analysis.groups.SHORT_TERM_LIABILITIES.total
  const donenVarliklarAfter = afterAnalysis.groups.CURRENT_ASSETS.total
  const kvykAfter = afterAnalysis.groups.SHORT_TERM_LIABILITIES.total
  const nisBefore = donenVarliklarBefore - kvykBefore
  const nisAfter = donenVarliklarAfter - kvykAfter
  const deltaNwcPctAssets = analysis.totals.assets > 0
    ? (nisAfter - nisBefore) / analysis.totals.assets
    : 0

  // DSO / CCC iyileşme hesabı — WC_COMPOSITION için
  function sumAmounts(accountsArr: { accountCode: string; amount: number }[], codes: string[]): number {
    return accountsArr
      .filter(a => codes.some(c => a.accountCode === c || a.accountCode.startsWith(c)))
      .reduce((s, a) => s + Math.abs(a.amount), 0)
  }

  const accountsBefore = analysis.accounts.map(a => ({ accountCode: a.accountCode, amount: a.amount }))

  const revenueBefore = sumAmounts(accountsBefore, ['600'])
  const cogsBefore = sumAmounts(accountsBefore, ['621'])
  const recBefore = sumAmounts(accountsBefore, ['120', '121', '126', '127'])
  const invBefore = sumAmounts(accountsBefore, ['150', '151', '152', '153', '157'])

  const revenueAfter = sumAmounts(updatedAccounts, ['600'])
  const cogsAfter = sumAmounts(updatedAccounts, ['621'])
  const recAfter = sumAmounts(updatedAccounts, ['120', '121', '126', '127'])
  const invAfter = sumAmounts(updatedAccounts, ['150', '151', '152', '153', '157'])

  // DSO iyileşmesi (gün) — alacak tahsil hızlanması
  const annualRevBefore = Math.max(revenueBefore, 1)
  const annualRevAfter = Math.max(revenueAfter, 1)
  const dsoBefore = (recBefore / annualRevBefore) * 365
  const dsoAfter = (recAfter / annualRevAfter) * 365
  const dsoImprovement = dsoBefore - dsoAfter   // pozitif = iyileşme

  // CCC iyileşmesi (gün) — DIO azalması (stok çevrim hızlanması)
  const annualCogsBefore = Math.max(cogsBefore, 1)
  const annualCogsAfter = Math.max(cogsAfter, 1)
  const dioBefore = (invBefore / annualCogsBefore) * 365
  const dioAfter = (invAfter / annualCogsAfter) * 365
  const cccImprovement = dioBefore - dioAfter   // pozitif = iyileşme

  // Aile tespiti
  const family = getActionFamily(candidate.actionId)

  // Aileye göre impact pass ve guardrail
  let passesImpact = false
  let monetaryOverridePass = false
  let guardrailsPass = false
  let impactMultiplier = 0

  if (family === 'WC_COMPOSITION') {
    // Guardrail: Quick Ratio < -0.02 ise reddet
    guardrailsPass = ratioDelta.QUICK_RATIO >= -0.02

    const ratioPass =
      ratioDelta.QUICK_RATIO >= thresholds.minQuickRatioDelta ||
      ratioDelta.CASH_RATIO >= thresholds.minCashRatioDelta

    const dsoPass = dsoImprovement >= thresholds.minDsoImprovementDays
    const cccPass = cccImprovement >= thresholds.minCccImprovementDays

    monetaryOverridePass =
      !ratioPass && !dsoPass && !cccPass &&
      deltaNwcPctAssets >= thresholds.minNetWorkingCapitalDeltaPctAssets &&
      guardrailsPass

    passesImpact = (ratioPass || dsoPass || cccPass || monetaryOverridePass) && guardrailsPass

    const positiveDeltas = [
      ratioDelta.QUICK_RATIO / (thresholds.minQuickRatioDelta * 3),
      ratioDelta.CASH_RATIO / (thresholds.minCashRatioDelta * 3),
      dsoImprovement / (thresholds.minDsoImprovementDays * 3),
      cccImprovement / (thresholds.minCccImprovementDays * 3),
    ].map(x => Math.max(0, Math.min(1, x)))
    impactMultiplier = positiveDeltas.reduce((a, b) => Math.max(a, b), 0)

  } else if (family === 'DEBT_STRUCTURE') {
    // Guardrail: Cari oran < -0.01 ise override reddet
    guardrailsPass = ratioDelta.CURRENT_RATIO >= -0.01

    const ratioPass =
      ratioDelta.CURRENT_RATIO >= thresholds.minCurrentRatioDelta ||
      ratioDelta.EQUITY_RATIO >= thresholds.minEquityRatioDelta ||
      ratioDelta.INTEREST_COVERAGE >= thresholds.minInterestCoverageDelta

    monetaryOverridePass =
      !ratioPass &&
      deltaNwcPctAssets >= thresholds.minNetWorkingCapitalDeltaPctAssets &&
      guardrailsPass

    passesImpact = ratioPass || monetaryOverridePass

    const positiveDeltas = [
      ratioDelta.CURRENT_RATIO / (thresholds.minCurrentRatioDelta * 3),
      ratioDelta.EQUITY_RATIO / (thresholds.minEquityRatioDelta * 3),
      ratioDelta.INTEREST_COVERAGE / (thresholds.minInterestCoverageDelta * 3),
    ].map(x => Math.max(0, Math.min(1, x)))
    impactMultiplier = positiveDeltas.reduce((a, b) => Math.max(a, b), 0)

  } else {
    // EQUITY_PNL
    // Guardrail: Özkaynak oranı düşmesin
    guardrailsPass = ratioDelta.EQUITY_RATIO >= -0.001

    const ratioPass =
      ratioDelta.EQUITY_RATIO >= thresholds.minEquityRatioDelta ||
      ratioDelta.INTEREST_COVERAGE >= thresholds.minInterestCoverageDelta ||
      ratioDelta.CURRENT_RATIO >= thresholds.minCurrentRatioDelta

    monetaryOverridePass =
      !ratioPass &&
      deltaNwcPctAssets >= thresholds.minNetWorkingCapitalDeltaPctAssets &&
      guardrailsPass

    passesImpact = ratioPass || monetaryOverridePass

    const positiveDeltas = [
      ratioDelta.EQUITY_RATIO / (thresholds.minEquityRatioDelta * 3),
      ratioDelta.INTEREST_COVERAGE / (thresholds.minInterestCoverageDelta * 3),
      ratioDelta.CURRENT_RATIO / (thresholds.minCurrentRatioDelta * 3),
    ].map(x => Math.max(0, Math.min(1, x)))
    impactMultiplier = positiveDeltas.reduce((a, b) => Math.max(a, b), 0)
  }

  if (!passesImpact) {
    constraintsTriggered.push("MINIMAL_IMPACT")
    if (family === 'WC_COMPOSITION') {
      warnings.push(
        `Etki yetersiz [${family}] — ΔQuick=${ratioDelta.QUICK_RATIO.toFixed(3)}, ΔCash=${ratioDelta.CASH_RATIO.toFixed(3)}, ΔDSO=${dsoImprovement.toFixed(1)}g, ΔCCC=${cccImprovement.toFixed(1)}g, ΔNİS/Aktif=${(deltaNwcPctAssets * 100).toFixed(2)}%`
      )
    } else {
      warnings.push(
        `Etki yetersiz [${family}] — ΔCari=${ratioDelta.CURRENT_RATIO.toFixed(3)}, ΔÖzk=${ratioDelta.EQUITY_RATIO.toFixed(3)}, ΔFaizKarş=${ratioDelta.INTEREST_COVERAGE.toFixed(2)}, ΔNİS/Aktif=${(deltaNwcPctAssets * 100).toFixed(2)}%`
      )
    }
  }

  if (monetaryOverridePass) {
    warnings.push(
      `Parasal override devreye girdi [${family}] — ΔNİS/Aktif=${(deltaNwcPctAssets * 100).toFixed(2)}%`
    )
  }

  // Kritik oran kötüleşmesi kontrolü (güvenlik)
  if (ratioDelta.CURRENT_RATIO < -0.05) {
    constraintsTriggered.push("CURRENT_RATIO_DEGRADED")
    warnings.push("Uyarı: cari oran önemli ölçüde düştü")
  }

  // Priority score hesabı
  const sourceGroupAnalysis = candidate.template.sourceGroup !== "EXTERNAL"
    ? analysis.groups[candidate.template.sourceGroup as Exclude<GroupCode, "EXTERNAL">]
    : null

  const materiality = Math.min(1, clampedAmount / Math.max(analysis.totals.assets * 0.08, 1))
  const manageability = sourceGroupAnalysis?.manageabilityScore ?? candidate.template.baseManageability
  const costScore = 1 - candidate.template.implementationCostIndex
  const feasibilityMultiplier = candidate.feasibilityMultiplier
  const confidenceMultiplier = candidate.template.confidence

  let finalPriorityScore = 100 * materiality * manageability * costScore *
    feasibilityMultiplier * impactMultiplier * confidenceMultiplier

  // Sektör priority bonusu
  if (candidate.sectorPrioritized) finalPriorityScore *= 1.15
  if (candidate.sectorDiscouraged) finalPriorityScore *= 0.70

  // Minimal impact — score 0
  if (!passesImpact) finalPriorityScore = 0

  // Fix E: Raporlama metrikleri
  const targetGroupAnalysisForMetrics = candidate.template.targetGroup !== 'EXTERNAL'
    ? analysis.groups[candidate.template.targetGroup as Exclude<GroupCode, 'EXTERNAL'>]
    : null
  const targetGroupImpact = targetGroupAnalysisForMetrics && Math.abs(targetGroupAnalysisForMetrics.total) > 0
    ? clampedAmount / Math.abs(targetGroupAnalysisForMetrics.total)
    : undefined
  const balanceSheetImpact = analysis.totals.assets > 0
    ? clampedAmount / analysis.totals.assets
    : undefined

  return {
    schemaVersion: "1.0.0",
    scenarioId: analysis.scenarioId,
    actionId: candidate.actionId,
    distributionModeApplied: candidate.distributionMode,
    amountRequested: amount,
    amountApplied: clampedAmount,
    beforeRatios,
    afterRatios,
    ratioDelta,
    groupDelta,
    accountMovements,
    constraintsTriggered,
    warnings,
    scoreBreakdown: {
      materiality,
      manageability,
      costScore,
      feasibilityMultiplier,
      impactMultiplier,
      confidenceMultiplier,
      finalPriorityScore,
    },
    targetGroupImpact,
    balanceSheetImpact,
    bindingCap: candidate.bindingCap ?? null,
  }
}
