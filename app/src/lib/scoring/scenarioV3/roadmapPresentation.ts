import type { ScenarioV3ApiResponse } from './responseTypes'
import {
  INEFFICIENCY_NARRATIVES,
  SEVERITY_LABELS,
  VISIBLE_SEVERITIES,
} from './inefficiencyNarratives'
import type {
  RoadmapHero,
  RoadmapConsultant,
  RoadmapIssue,
  RoadmapPerspective,
  RoadmapIfNotDone,
  PerspectiveLevel,
  IssueSeverity,
  ScenarioDataV3,
  ActionPlanV3,
  ActionPlanItemV3,
  ActionHorizon,
  AccountMovement,
  RatioImpact,
  RatioImpactRow,
} from '@/types/report'
import { CHART_OF_ACCOUNTS } from '@/lib/scoring/chartOfAccounts'

// Productivity layer türü (layerSummaries.productivity: unknown olarak tanımlı)
type ProductivityLayer = {
  productivityScore: number
  metrics: {
    cashFromOperationsToAssets?: number | null
    trappedAssetsShare?: number
    [key: string]: unknown
  }
  inefficiencyFlags: Array<{ type: string; severity: string; description: string }>
} | null

// =============
// LEVEL HELPERS
// =============

/**
 * Likidite: cashFromOperationsToAssets kullanılıyor.
 * (Web tarafı cashToAssets bekliyor ama o alan YOK — Codex teyit.)
 */
export function likiditeLevel(
  cashFromOpsToAssets: number | null | undefined,
): PerspectiveLevel {
  if (cashFromOpsToAssets == null) return 'Orta'
  if (cashFromOpsToAssets > 0.10) return 'İyi'
  if (cashFromOpsToAssets > 0.03) return 'Orta'
  return 'Zayıf'
}

export function yapisalRiskLevel(trappedAssetsShare: number): PerspectiveLevel {
  if (trappedAssetsShare < 0.30) return 'Düşük'
  if (trappedAssetsShare < 0.60) return 'Orta'
  return 'Yüksek'
}

export function aktifVerimlilikLevel(productivityScore: number): PerspectiveLevel {
  if (productivityScore >= 0.70) return 'İyi'
  if (productivityScore >= 0.40) return 'Orta'
  return 'Zayıf'
}

export function ratingGuveniLevel(confidence: string): PerspectiveLevel {
  const upper = (confidence ?? '').toUpperCase()
  if (upper === 'HIGH')   return 'Yüksek'
  if (upper === 'MEDIUM') return 'Orta'
  return 'Düşük'
}

// =============
// MAIN MAPPER
// =============

/**
 * V3 response'tan PDF Sayfa 11 için compact DTO üret.
 * Hata olursa null döner.
 */
export function mapV3ToScenarioDataV3(
  response: ScenarioV3ApiResponse,
): ScenarioDataV3 | null {
  try {
    const da = response.decisionAnswer
    const productivity = response.engineResult?.layerSummaries?.productivity as ProductivityLayer

    if (!da || !productivity) {
      return null
    }

    // ======
    // HERO
    // (canonicalOutcome obje .isFeasible alanı Codex D3 teyit)
    // ======
    const isFeasible = da.canonicalOutcome?.isFeasible ?? false

    const confidenceLevel = ratingGuveniLevel(
      da.executiveAnswer?.confidence ?? 'LOW',
    )

    // ExecutiveAnswer alanları: headline, subtitle, executiveSummary
    const summaryText =
      da.executiveAnswer?.executiveSummary ??
      da.executiveAnswer?.headline ??
      ''

    const hero: RoadmapHero = {
      currentRating:      response.currentRating,
      targetRating:       response.targetRating,
      reachable:          isFeasible,
      reachabilityLabel:  isFeasible ? 'Hedef Ulaşılabilir' : 'Hedef Zor',
      confidence:         confidenceLevel,
      summaryText,
    }

    // ======
    // CONSULTANT
    // ======
    const cn = da.consultantNarrative
    const consultant: RoadmapConsultant = {
      problem:            cn?.problem            ?? '',
      coreIssue:          cn?.coreIssue          ?? '',
      shortTermPriority:  cn?.shortTermPriority  ?? '',
      structuralNeed:     cn?.structuralNeed     ?? '',
      finrateComment:     cn?.bankerView         ?? '',
    }

    // ======
    // ISSUES
    // (decisionLayer.ts:350 buildProblemInefficiencyBlock pattern)
    // ======
    const flags = productivity.inefficiencyFlags ?? []

    const issues: RoadmapIssue[] = flags
      // VISIBLE_SEVERITIES filter
      .filter(flag =>
        (VISIBLE_SEVERITIES as ReadonlyArray<string>).includes(flag.severity)
      )
      // ilk 3
      .slice(0, 3)
      .map(flag => {
        const narrative =
          INEFFICIENCY_NARRATIVES[flag.type as keyof typeof INEFFICIENCY_NARRATIVES]

        const severityTr =
          SEVERITY_LABELS[flag.severity as keyof typeof SEVERITY_LABELS] ?? 'ORTA'

        return {
          title:          narrative?.title    ?? flag.type ?? 'Yapısal Sorun',
          severity:       severityTr as IssueSeverity,
          description:    narrative?.description    ?? '',
          // Evidence: flag.description (Codex D3 + decisionLayer pattern)
          evidence:       flag.description ?? '',
          ifNotAddressed: narrative?.ifNotAddressed ?? '',
        }
      })

    // ======
    // PERSPECTIVE
    // (Codex teyit: cashFromOperationsToAssets kullan)
    // ======
    const metrics = productivity.metrics ?? {}

    const perspective: RoadmapPerspective = {
      likidite:          likiditeLevel(
        (metrics.cashFromOperationsToAssets as number | null | undefined) ?? null,
      ),
      yapisalRisk:       yapisalRiskLevel(
        (metrics.trappedAssetsShare as number | undefined) ?? 0,
      ),
      aktifVerimliligi:  aktifVerimlilikLevel(
        productivity.productivityScore ?? 0,
      ),
      ratingGuveni:      confidenceLevel,
    }

    // ======
    // IF NOT DONE
    // ======
    const ifNotDone: RoadmapIfNotDone = {
      generalWarning: da.ifNotDoneRisk ?? '',
      issueRisks:     issues.map(issue => ({
        title: issue.title,
        risk:  issue.ifNotAddressed,
      })),
    }

    return {
      kind: 'v3-summary',
      hero,
      consultant,
      issues,
      perspective,
      ifNotDone,
    }
  } catch (err) {
    console.error('mapV3ToScenarioDataV3 failed:', err)
    return null
  }
}

// ============= LOCAL HELPERS =============
// Web AccountImpactTable.tsx ve RatioTransparencyBlock.tsx'ten alındı.
// Lib katmanı için local yazıldı (client component import etmiyoruz).

function getAccountSideLocal(code: string): 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' {
  const acc = CHART_OF_ACCOUNTS[code]
  if (acc) return acc.side
  const p = code.charAt(0)
  if (p === '1' || p === '2') return 'ASSET'
  if (p === '3' || p === '4') return 'LIABILITY'
  if (p === '5') return 'EQUITY'
  if (p === '6') return 'INCOME'
  return 'EXPENSE'
}

function getProposedBalanceLocal(current: number, legSide: 'DEBIT' | 'CREDIT', side: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE', amount: number): number {
  const increases = (side === 'ASSET' && legSide === 'DEBIT') || (side === 'LIABILITY' && legSide === 'CREDIT') || (side === 'EQUITY' && legSide === 'CREDIT')
  return increases ? current + amount : current - amount
}

function formatAmountLocal(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mn`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} K`
  return `${n.toFixed(0)}`
}

function formatPercentLocal(n: number): string {
  return `%${(n * 100).toFixed(1)}`
}

function formatTurnoverLocal(n: number): string {
  return `${n.toFixed(2)}x`
}

function buildRatioImpactFromRT(rt: unknown): RatioImpact | null {
  if (!rt || typeof rt !== 'object') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = rt as any
  const kind = data.kind ?? 'balance'

  if (kind === 'margin') {
    const rows: RatioImpactRow[] = [
      { label: 'Bugünkü', value: formatPercentLocal(data.current ?? 0), color: 'navy' },
      { label: 'Gerçekçi 12 ay', value: formatPercentLocal(data.realisticTarget ?? 0), color: 'teal' },
      { label: 'TCMB sektör', value: formatPercentLocal(data.sectorMedian ?? 0), color: 'navy' },
    ]
    return { title: data.metricLabel ?? 'Marj', rows, formula: data.formula?.description ?? '' }
  }

  if (kind === 'turnover') {
    const rows: RatioImpactRow[] = [
      { label: 'Bugünkü', value: formatTurnoverLocal(data.current ?? 0), color: 'navy' },
      { label: 'Gerçekçi 12 ay', value: formatTurnoverLocal(data.realisticTarget ?? 0), color: 'teal' },
      { label: 'TCMB sektör', value: formatTurnoverLocal(data.sectorMedian ?? 0), color: 'navy' },
    ]
    return { title: data.metricLabel ?? 'Devir Hızı', rows, formula: data.formula?.description ?? '' }
  }

  // kind === 'balance' veya undefined (geriye uyum)
  const formula = data.formula ?? {}
  const formulaStr = formula.targetLabel && formula.basisLabel
    ? `${formula.targetLabel} = (${formula.basisLabel} × ${formula.targetDays ?? '?'}) / ${formula.periodDays ?? '?'}`
    : ''
  const rows: RatioImpactRow[] = [
    { label: 'Bugünkü', value: formatAmountLocal(data.currentBalance ?? 0), color: 'navy' },
    { label: 'Gerçekçi 12 ay', value: formatAmountLocal(data.realisticTarget ?? 0), color: 'teal' },
    { label: 'TCMB sektör', value: formatAmountLocal(data.sectorMedian ?? 0), color: 'navy' },
  ]
  return { title: 'Hedef', rows, formula: formulaStr }
}

/**
 * V3 response'tan PDF Sayfa 12+13 için action plan DTO üret.
 * Hata olursa null döner.
 */
export function mapV3ToActionPlanV3(
  response: ScenarioV3ApiResponse,
): ActionPlanV3 | null {
  try {
    const da = response.decisionAnswer

    if (!da) {
      return null
    }

    // isFeasible (Codex teyit — canonicalOutcome.isFeasible obje field)
    const isFeasible = da.canonicalOutcome?.isFeasible ?? true

    // PAGE TITLE (web ScenarioPanelV3 line 640-642 BİREBİR)
    const pageTitle = !isFeasible
      ? 'Mevcut Seviyeyi Koruma — Aksiyon Önerileri'
      : 'Firma Ne Yapmalı?'

    // PAGE SUBTITLE (web ScenarioPanelV3 line 644-647 BİREBİR)
    const actionCount = da.whatCompanyShouldDo?.length ?? 0
    const pageSubtitle = !isFeasible
      ? 'Aşağıdaki aksiyonlar BBB hedefine taşımaz; mevcut seviyeyi korumak için sıralanmıştır.'
      : `Öncelik sırasına göre ${actionCount} aksiyon önerisi.`

    // ACTIONS
    const rawActions = da.whatCompanyShouldDo ?? []
    const legsByAction = da.accountingLegsByAction ?? {}
    const currentBalances = response.currentAccountBalances ?? {}

    const actions: ActionPlanItemV3[] = rawActions.map((a, idx) => {
      // Tüm leg'leri topla
      const legData = legsByAction[a.actionId]
      const allLegs = [
        ...(legData?.debits ?? []).map((l: { accountCode: string; accountName?: string; amountTRY: number }) => ({ ...l, legSide: 'DEBIT' as const })),
        ...(legData?.credits ?? []).map((l: { accountCode: string; accountName?: string; amountTRY: number }) => ({ ...l, legSide: 'CREDIT' as const })),
      ]

      // 690 kapanış + akış hesapları (INCOME/EXPENSE) filtrele — sadece bilanço gösterilir
      const balanceLegs = allLegs.filter(leg => {
        if (leg.accountCode === '690') return false
        const side = getAccountSideLocal(leg.accountCode)
        return side === 'ASSET' || side === 'LIABILITY' || side === 'EQUITY'
      })

      // Her bilanço leg'i için Mevcut/Önerilen/Δ hesapla
      const accountMovements: AccountMovement[] = balanceLegs.map(leg => {
        const side = getAccountSideLocal(leg.accountCode)
        const current = (currentBalances as Record<string, number>)[leg.accountCode] ?? 0
        const proposed = getProposedBalanceLocal(current, leg.legSide, side, leg.amountTRY)
        const deltaTRY = proposed - current
        return {
          accountCode: leg.accountCode,
          accountName: leg.accountName ?? '',
          currentTRY: current,
          proposedTRY: proposed,
          deltaTRY,
          isIncrease: deltaTRY >= 0,
        }
      })

      // Rasyo etkisini map et (varsa)
      const ratioImpact = buildRatioImpactFromRT(a.ratioTransparency)

      return {
        rank:              a.rank ?? idx + 1,
        actionName:        a.actionName ?? 'Aksiyon',
        horizonLabel:      (a.horizonLabel ?? '—') as ActionHorizon,
        amountFormatted:   a.amountFormatted ?? '—',
        bankerPerspective: a.bankerPerspective ?? '',
        accountMovements,
        ratioImpact:       ratioImpact ?? undefined,
      }
    })

    // WHY CAPITAL
    const whyCapitalAloneNotEnough = da.whyCapitalAloneIsNotEnough ?? ''

    return {
      kind: 'v3-actions',
      isFeasible,
      pageTitle,
      pageSubtitle,
      actions,
      whyCapitalAloneNotEnough,
    }
  } catch (err) {
    console.error('mapV3ToActionPlanV3 failed:', err)
    return null
  }
}
