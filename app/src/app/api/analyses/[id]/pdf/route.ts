import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calcSubjectiveScore, combineScores } from '@/lib/scoring/subjective'
import { scoreToRating } from '@/lib/scoring/score'
import { buildReportPdf } from '@/lib/reporting/reportPdf.next'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  const analysis = await prisma.analysis.findFirst({
    where: { id, userId },
    select: {
      id: true,
      year: true,
      period: true,
      finalScore: true,
      finalRating: true,
      liquidityScore: true,
      profitabilityScore: true,
      leverageScore: true,
      activityScore: true,
      ratios: true,
      optimizerSnapshot: true,
      entity: { select: { id: true, name: true, sector: true } },
    },
  })

  if (!analysis) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  const subjectiveInput = analysis.entity?.id
    ? await prisma.subjectiveInput.findUnique({ where: { entityId: analysis.entity.id } })
    : null

  const subjectiveTotal = subjectiveInput ? calcSubjectiveScore(subjectiveInput).total : 0
  const finalScore = Math.round((analysis.finalScore ?? 0) * 100) / 100
  const combinedScore = combineScores(finalScore, subjectiveTotal)
  const combinedRating = scoreToRating(combinedScore)

  const { bytes, fileName } = await buildReportPdf({
    analysis: {
      ...analysis,
      finalScore,
      finalRating: analysis.finalRating ?? '-',
      liquidityScore: Math.round(analysis.liquidityScore ?? 0),
      profitabilityScore: Math.round(analysis.profitabilityScore ?? 0),
      leverageScore: Math.round(analysis.leverageScore ?? 0),
      activityScore: Math.round(analysis.activityScore ?? 0),
      ratios: analysis.ratios ? JSON.parse(analysis.ratios as string) : {},
      optimizerSnapshot: analysis.optimizerSnapshot ? JSON.parse(analysis.optimizerSnapshot as string) : null,
    },
    combinedScore,
    combinedRating,
    subjectiveTotal,
  })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}
