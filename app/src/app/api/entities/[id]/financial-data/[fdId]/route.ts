import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'

// PATCH /api/entities/[id]/financial-data/[fdId] — tekil alan güncelle (TdhpSpreadsheet inline düzenleme)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId } = await params

  const existing = await prisma.financialData.findFirst({
    where: { id: fdId, entityId, entity: { userId } },
  })
  if (!existing) return jsonUtf8({ error: 'Kayıt bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()

    const updateData: Record<string, number | null> = {}
    for (const [key, val] of Object.entries(body)) {
      if (val === null) {
        updateData[key] = null
      } else if (typeof val === 'number' && !isNaN(val)) {
        updateData[key] = val
      }
    }

    const updated = await prisma.financialData.update({
      where: { id: fdId },
      data: { ...updateData, updatedAt: new Date() },
    })

    // ManualAdjustment kaydı — her güncellenen alan için upsert
    for (const [key, val] of Object.entries(updateData)) {
      if (val != null) {
        await prisma.manualAdjustment.upsert({
          where: {
            financialDataId_fieldName_scenarioName: {
              financialDataId: fdId,
              fieldName:       key,
              scenarioName:    'manual',
            },
          },
          create: {
            financialDataId: fdId,
            fieldName:       key,
            adjustedValue:   val,
            scenarioName:    'manual',
          },
          update: {
            adjustedValue: val,
          },
        })
      }
    }

    // Skor yeniden hesapla
    const numericKeys = [
      'revenue','cogs','grossProfit','operatingExpenses','ebit','depreciation',
      'ebitda','interestExpense','otherIncome','otherExpense','ebt','taxExpense',
      'netProfit','netProfitCurrentYear','cash','shortTermInvestments',
      'tradeReceivables','inventory','otherCurrentAssets','totalCurrentAssets',
      'tangibleAssets','intangibleAssets','longTermInvestments','otherNonCurrentAssets',
      'totalNonCurrentAssets','totalAssets','shortTermFinancialDebt','tradePayables',
      'otherCurrentLiabilities','totalCurrentLiabilities','longTermFinancialDebt',
      'otherNonCurrentLiabilities','totalNonCurrentLiabilities','paidInCapital',
      'retainedEarnings','totalEquity','totalLiabilitiesAndEquity','purchases',
    ] as const

    const allFields: Record<string, number | null> = {}
    for (const k of numericKeys) {
      const v = (updated as Record<string, unknown>)[k]
      allFields[k] = v != null ? Number(v) : null
    }

    const ratios = calculateRatios(allFields)
    const score  = calculateScore(ratios)

    const existingAnalysis = await prisma.analysis.findUnique({ where: { financialDataId: fdId } })
    if (existingAnalysis) {
      await prisma.analysis.update({
        where: { id: existingAnalysis.id },
        data: {
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             JSON.stringify(ratios),
          updatedAt:          new Date(),
        },
      })
    }

    return jsonUtf8({ financialData: updated, score })
  } catch (err) {
    console.error(err)
    return jsonUtf8({ error: 'Güncelleme başarısız.' }, { status: 500 })
  }
}

// DELETE /api/entities/[id]/financial-data/[fdId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId } = await params

  // Şirketin bu kullanıcıya ait olduğunu doğrula
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  // Mali verinin bu şirkete ait olduğunu doğrula
  const fd = await prisma.financialData.findFirst({ where: { id: fdId, entityId } })
  if (!fd) return jsonUtf8({ error: 'Mali veri bulunamadı.' }, { status: 404 })

  // İlişkili analizi de sil, sonra mali veriyi sil
  await prisma.analysis.deleteMany({ where: { financialDataId: fdId } })
  await prisma.financialData.delete({ where: { id: fdId } })

  return jsonUtf8({ success: true })
}
