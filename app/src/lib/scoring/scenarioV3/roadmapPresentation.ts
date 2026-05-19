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
} from '@/types/report'

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

    const actions: ActionPlanItemV3[] = rawActions.map((a, idx) => ({
      rank:              a.rank ?? idx + 1,
      actionName:        a.actionName ?? 'Aksiyon',
      horizonLabel:      (a.horizonLabel ?? '—') as ActionHorizon,
      amountFormatted:   a.amountFormatted ?? '—',
      bankerPerspective: a.bankerPerspective ?? '',
    }))

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
