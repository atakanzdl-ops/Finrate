import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { ACCOUNT_FIELD, applyAccountDelta } from '@/lib/tdhp/accountFieldMap'
import { TDHP_ACCOUNT_BY_CODE, tdhpAccountName } from '@/lib/tdhp/chart'
import { rescoreFinancialData } from '@/lib/scoring/rescoreFinancialData'

// PATCH /api/entities/[id]/financial-data/[fdId]/accounts — tek bir 3 haneli hesabı güncelle
// Body: { code: '101', amount: 17824850 }  (amount = bakiye büyüklüğü, kontra hesaplar da pozitif girilir)
// Sadece o hesabın bağlı olduğu toplu alan ve dolu üst toplamlar FARK kadar değişir;
// skor, yükleme yoluyla aynı fonksiyonlarla yeniden hesaplanır.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId } = await params
  const fd = await prisma.financialData.findFirst({
    where: { id: fdId, entityId, entity: { userId } },
    include: { analysis: { select: { id: true } } },
  })
  if (!fd) return jsonUtf8({ error: 'Kayıt bulunamadı.' }, { status: 404 })
  if (!fd.analysis) return jsonUtf8({ error: 'Bu dönem için analiz kaydı yok.' }, { status: 409 })

  const body = await req.json().catch(() => null) as { code?: unknown; amount?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const amountRaw = body?.amount
  const amount = amountRaw === null || amountRaw === '' ? 0 : Number(amountRaw)

  if (!TDHP_ACCOUNT_BY_CODE[code] || !ACCOUNT_FIELD[code]) {
    return jsonUtf8({ error: `Geçersiz veya düzenlenemeyen hesap kodu: ${code}` }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return jsonUtf8({ error: 'Tutar 0 veya pozitif bir sayı olmalı (kontra hesaplar da pozitif girilir).' }, { status: 400 })
  }

  const analysisId = fd.analysis.id
  const existing = await prisma.financialAccount.findFirst({ where: { analysisId, accountCode: code } })
  const current = existing ? Number(existing.amount) : 0
  const delta = amount - current

  if (amount === 0 && existing) {
    await prisma.financialAccount.delete({ where: { id: existing.id } })
  } else if (existing) {
    await prisma.financialAccount.update({ where: { id: existing.id }, data: { amount } })
  } else if (amount !== 0) {
    await prisma.financialAccount.create({
      data: { analysisId, accountCode: code, accountName: tdhpAccountName(code), amount },
    })
  }

  const { analysis: _a, ...fdFields } = fd
  void _a
  const changed = applyAccountDelta(fdFields as unknown as Record<string, number | null>, code, delta)
  if (Object.keys(changed).length > 0) {
    await prisma.financialData.update({ where: { id: fdId }, data: { ...changed, updatedAt: new Date() } })
  }

  const result = await rescoreFinancialData(fdId)
  return jsonUtf8({ code, amount, delta, changedFields: changed, score: result?.resolved ?? null })
}
