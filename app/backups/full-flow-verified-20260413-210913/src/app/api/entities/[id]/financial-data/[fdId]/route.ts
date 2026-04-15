import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

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
