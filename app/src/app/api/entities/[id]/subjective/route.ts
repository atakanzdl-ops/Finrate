import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calcSubjectiveScore } from '@/lib/scoring/subjective'

// GET /api/entities/[id]/subjective
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const sub = await prisma.subjectiveInput.findUnique({ where: { entityId } })
  const score = sub ? calcSubjectiveScore(sub) : null

  return jsonUtf8({ subjectiveInput: sub, score })
}

// POST /api/entities/[id]/subjective
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const {
      kkbCategory, activeDelayDays, checkProtest, enforcementFile,
      creditLimitUtilPct, hasMultipleBanks, avgMaturityMonths,
      companyAgeYears, auditLevel, ownershipClarity,
      hasTaxDebt, hasSgkDebt, activeLawsuitCount,
    } = body

    // Input aralık doğrulaması
    const VALID_KKB = ['iyi', 'orta', 'kotu', 'cok_kotu']
    const VALID_AUDIT = ['bagimsiz', 'ymm', 'smmm', 'none']
    if (kkbCategory != null && !VALID_KKB.includes(kkbCategory))
      return jsonUtf8({ error: 'Geçersiz KKB kategorisi.' }, { status: 400 })
    if (auditLevel != null && !VALID_AUDIT.includes(auditLevel))
      return jsonUtf8({ error: 'Geçersiz denetim seviyesi.' }, { status: 400 })
    if (creditLimitUtilPct != null && (creditLimitUtilPct < 0 || creditLimitUtilPct > 100))
      return jsonUtf8({ error: 'Kredi limit kullanımı 0-100 arasında olmalıdır.' }, { status: 400 })
    if (companyAgeYears != null && (companyAgeYears < 0 || companyAgeYears > 200))
      return jsonUtf8({ error: 'Firma yaşı geçersiz.' }, { status: 400 })
    if (activeLawsuitCount != null && (activeLawsuitCount < 0 || activeLawsuitCount > 9999))
      return jsonUtf8({ error: 'Dava sayısı geçersiz.' }, { status: 400 })
    if (activeDelayDays != null && activeDelayDays < 0)
      return jsonUtf8({ error: 'Gecikme günü negatif olamaz.' }, { status: 400 })

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
    return jsonUtf8({ subjectiveInput, score })
  } catch (err) {
    console.error(err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
