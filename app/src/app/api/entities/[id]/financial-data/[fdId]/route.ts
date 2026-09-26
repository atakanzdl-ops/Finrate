import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { rescoreFinancialData } from '@/lib/scoring/rescoreFinancialData'
import { deleteStoredFiles } from '@/lib/fileStorage'

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

    // Skor: yükleme yoluyla aynı adımlar (sektör + önceki yıl + subjektif birleşimi)
    const result = await rescoreFinancialData(fdId)

    return jsonUtf8({ financialData: updated, score: result?.resolved ?? null })
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

  // Saklanan dosyaları da temizle (kayıtlar cascade ile silinir)
  try {
    const ups = await prisma.financialDataUpload.findMany({ where: { financialDataId: fdId }, select: { fileUrl: true } })
    await deleteStoredFiles(ups.map(u => u.fileUrl))
  } catch { /* depolama temizliği isteğe bağlı */ }

  // İlişkili analizi de sil, sonra mali veriyi sil
  await prisma.analysis.deleteMany({ where: { financialDataId: fdId } })
  await prisma.financialData.delete({ where: { id: fdId } })

  return jsonUtf8({ success: true })
}
