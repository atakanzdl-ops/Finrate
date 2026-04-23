import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { getUserIdFromRequest }      from '@/lib/auth'
import { runScenarioEngine }         from '@/lib/scoring/scenario/engine'
import { calculateRatiosFromAccounts } from '@/lib/scoring/ratios'
import { calculateScore, scoreToRating, getRatingMinimum } from '@/lib/scoring/score'

/**
 * Hedef nota karşılık gelen minimum skoru döndürür.
 * Örn: 'BB' → 60, 'A' → 76
 */
function gradeToTargetScore(grade: string): number {
  const min = getRatingMinimum(grade)
  return min > 0 ? min : 60  // fallback
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { analysisId, groupId, targetGrade } = body

    if (!targetGrade) {
      return NextResponse.json({ error: 'targetGrade gerekli' }, { status: 400 })
    }

    // ── Grup path — v2'de henüz desteklenmiyor ──────────────────────────────
    if (groupId) {
      return NextResponse.json(
        {
          error: "Grup senaryoları v2'de henüz desteklenmiyor. /api/scenarios kullanın.",
          engine: 'v2',
        },
        { status: 501 }
      )
    }

    if (!analysisId) {
      return NextResponse.json(
        { error: 'analysisId veya groupId gerekli' },
        { status: 400 }
      )
    }

    // ── Solo path — analysisId ile tek firma ────────────────────────────────
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        entity: { userId },
      },
      include: {
        entity: true,
        financialAccounts: true,
        financialData: true,
      },
    })

    if (!analysis || !analysis.entity) {
      return NextResponse.json({ error: 'Analiz bulunamadı' }, { status: 404 })
    }

    if (analysis.financialAccounts.length === 0) {
      return NextResponse.json(
        {
          error: 'Bu analiz için hesap kodu verisi yok. Mizan yüklemesi gerekli.',
          engine: 'v2',
          requiresAccountData: true,
        },
        { status: 400 }
      )
    }

    const accounts = analysis.financialAccounts.map(a => ({
      accountCode: a.accountCode,
      amount: Number(a.amount),
    }))

    const ratios = calculateRatiosFromAccounts(accounts)
    const sector: string = analysis.entity.sector ?? 'İmalat'
    const scoreResult = calculateScore(ratios, sector)

    // Subjektif bonus — DB'deki scoreFinal ile finansal skor arasındaki fark
    const financialScore = scoreResult.finalScore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawScoreFinal = (analysis as any).scoreFinal
    const combinedScore  = rawScoreFinal != null ? Number(rawScoreFinal) : financialScore
    const subjectiveBonus = combinedScore - financialScore

    const currentScore = combinedScore
    const currentGrade = scoreToRating(currentScore)
    const targetScore  = gradeToTargetScore(targetGrade)

    const result = runScenarioEngine({
      accounts,
      companyId:  analysis.entityId ?? analysis.id,
      scenarioId: `solo-${analysis.id}-${Date.now()}`,
      sector,
      currentScore,
      currentGrade,
      targetGrade,
      targetScore,
      subjectiveBonus,
      currentRatios: {
        CURRENT_RATIO:      ratios.currentRatio      ?? 0,
        QUICK_RATIO:        ratios.quickRatio         ?? 0,
        CASH_RATIO:         ratios.cashRatio          ?? 0,
        EQUITY_RATIO:       ratios.equityRatio        ?? 0,
        DEBT_TO_EQUITY:     ratios.debtToEquity       ?? 0,
        INTEREST_COVERAGE:  ratios.interestCoverage   ?? 0,
      },
    })

    return NextResponse.json({
      engine: 'v2',
      scenarios: result.scenarios,
      currentScore,
      currentGrade,
      sector,
      emergencyAssessment:  result.emergencyAssessment,
      stressLevel:          result.stressLevel,
      appliedThresholds:    result.appliedThresholds,
      appliedMicroFilter:   result.appliedMicroFilter,
      sixGroupAnalysis: {
        totals:   result.analysis.totals,
        groups:   Object.fromEntries(
          Object.entries(result.analysis.groups).map(([k, v]) => [
            k,
            {
              total:                  v.total,
              shareOfReferenceBase:   v.shareOfReferenceBase,
              top3: v.composition.top3.map(a => ({
                code:         a.accountCode,
                name:         a.accountName,
                amount:       a.amount,
                shareInGroup: a.shareInGroup,
              })),
              basePriorityScore: v.basePriorityScore,
            },
          ])
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warnings: (result.analysis as any).warnings ?? [],
      },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Senaryo hesaplanamadı'
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[scenarios/v2] error:', err)
    return NextResponse.json(
      {
        error:  message,
        engine: 'v2',
        stack:  process.env.NODE_ENV === 'development' ? stack : undefined,
      },
      { status: 500 }
    )
  }
}
