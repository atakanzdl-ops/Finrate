import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calcSubjectiveScore, combineScores, SubjectiveInputData } from '@/lib/scoring/subjective'
import { scoreToRating } from '@/lib/scoring/score'

// ─── GET: mevcut subjektif girdiyi ve skoru döndür ────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Şirket bulunamadı.' }, { status: 404 })

  const row = await prisma.subjectiveInput.findUnique({ where: { entityId } })
  if (!row) return jsonUtf8({ subjectiveInput: null, score: null })

  const input: SubjectiveInputData = {
    kkbCategory:        row.kkbCategory,
    activeDelayDays:    row.activeDelayDays,
    checkProtest:       row.checkProtest,
    enforcementFile:    row.enforcementFile,
    creditLimitUtilPct: row.creditLimitUtilPct,
    hasMultipleBanks:   row.hasMultipleBanks,
    avgMaturityMonths:  row.avgMaturityMonths,
    companyAgeYears:    row.companyAgeYears,
    auditLevel:         row.auditLevel,
    ownershipClarity:   row.ownershipClarity,
    hasTaxDebt:         row.hasTaxDebt,
    hasSgkDebt:         row.hasSgkDebt,
    activeLawsuitCount: row.activeLawsuitCount,
  }

  const score = calcSubjectiveScore(input)
  return jsonUtf8({ subjectiveInput: input, score })
}

// ─── POST: kaydet + birleşik skoru analiz tablosuna yaz ──────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Şirket bulunamadı.' }, { status: 404 })

  const body = await req.json() as SubjectiveInputData

  // SubjectiveInput kaydet / güncelle
  const saved = await prisma.subjectiveInput.upsert({
    where:  { entityId },
    create: {
      entityId,
      kkbCategory:        body.kkbCategory        ?? 'orta',
      activeDelayDays:    body.activeDelayDays     ?? 0,
      checkProtest:       body.checkProtest        ?? false,
      enforcementFile:    body.enforcementFile     ?? false,
      creditLimitUtilPct: body.creditLimitUtilPct  ?? 70,
      hasMultipleBanks:   body.hasMultipleBanks    ?? false,
      avgMaturityMonths:  body.avgMaturityMonths   ?? 6,
      companyAgeYears:    body.companyAgeYears     ?? 3,
      auditLevel:         body.auditLevel          ?? 'ymm',
      ownershipClarity:   body.ownershipClarity    ?? true,
      hasTaxDebt:         body.hasTaxDebt          ?? false,
      hasSgkDebt:         body.hasSgkDebt          ?? false,
      activeLawsuitCount: body.activeLawsuitCount  ?? 0,
    },
    update: {
      kkbCategory:        body.kkbCategory        ?? 'orta',
      activeDelayDays:    body.activeDelayDays     ?? 0,
      checkProtest:       body.checkProtest        ?? false,
      enforcementFile:    body.enforcementFile     ?? false,
      creditLimitUtilPct: body.creditLimitUtilPct  ?? 70,
      hasMultipleBanks:   body.hasMultipleBanks    ?? false,
      avgMaturityMonths:  body.avgMaturityMonths   ?? 6,
      companyAgeYears:    body.companyAgeYears     ?? 3,
      auditLevel:         body.auditLevel          ?? 'ymm',
      ownershipClarity:   body.ownershipClarity    ?? true,
      hasTaxDebt:         body.hasTaxDebt          ?? false,
      hasSgkDebt:         body.hasSgkDebt          ?? false,
      activeLawsuitCount: body.activeLawsuitCount  ?? 0,
    },
  })

  // Subjektif skor hesapla
  const score = calcSubjectiveScore(saved)

  // Bu şirketin tüm analizlerinde finalScore'u güncelle (birleşik skor)
  const analyses = await prisma.analysis.findMany({
    where: { entityId, mode: 'SOLO' },
    select: { id: true, finalScore: true, ratios: true },
  })

  for (const a of analyses) {
    const ratios = a.ratios ? JSON.parse(a.ratios) : {}
    // __financialScore varsa kullan (daha önce kaydedilmiş), yoksa mevcut finalScore
    const financialScore = ratios.__financialScore ?? a.finalScore ?? 0
    const combined       = combineScores(financialScore, score.total)
    const combinedRating = scoreToRating(combined)

    const updatedRatios = {
      ...ratios,
      __financialScore:  financialScore,
      __subjectiveTotal: score.total,
    }

    await prisma.analysis.update({
      where: { id: a.id },
      data: {
        finalScore:  combined,
        finalRating: combinedRating,
        ratios:      JSON.stringify(updatedRatios),
        updatedAt:   new Date(),
      },
    })
  }

  return jsonUtf8({ subjectiveInput: saved, score, updatedAnalyses: analyses.length })
}