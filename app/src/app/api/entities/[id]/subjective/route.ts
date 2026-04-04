import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calcSubjectiveScore } from '@/lib/scoring/subjective'

// GET /api/entities/[id]/subjective
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  const sub = await prisma.subjectiveInput.findUnique({ where: { entityId } })
  const score = sub ? calcSubjectiveScore(sub) : null

  return NextResponse.json({ subjectiveInput: sub, score })
}

// POST /api/entities/[id]/subjective
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const {
      kkbCategory, activeDelayDays, checkProtest, enforcementFile,
      creditLimitUtilPct, hasMultipleBanks, avgMaturityMonths,
      companyAgeYears, auditLevel, ownershipClarity,
      hasTaxDebt, hasSgkDebt, activeLawsuitCount,
    } = body

    const subjectiveInput = await prisma.subjectiveInput.upsert({
      where: { entityId },
      update: {
        kkbCategory, activeDelayDays, checkProtest, enforcementFile,
        creditLimitUtilPct, hasMultipleBanks, avgMaturityMonths,
        companyAgeYears, auditLevel, ownershipClarity,
        hasTaxDebt, hasSgkDebt, activeLawsuitCount,
        updatedAt: new Date(),
      },
      create: {
        entityId,
        kkbCategory: kkbCategory ?? 'orta',
        activeDelayDays: activeDelayDays ?? 0,
        checkProtest: checkProtest ?? false,
        enforcementFile: enforcementFile ?? false,
        creditLimitUtilPct: creditLimitUtilPct ?? 70,
        hasMultipleBanks: hasMultipleBanks ?? false,
        avgMaturityMonths: avgMaturityMonths ?? 6,
        companyAgeYears: companyAgeYears ?? 3,
        auditLevel: auditLevel ?? 'ymm',
        ownershipClarity: ownershipClarity ?? true,
        hasTaxDebt: hasTaxDebt ?? false,
        hasSgkDebt: hasSgkDebt ?? false,
        activeLawsuitCount: activeLawsuitCount ?? 0,
      },
    })

    const score = calcSubjectiveScore(subjectiveInput)
    return NextResponse.json({ subjectiveInput, score })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
