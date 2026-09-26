import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/entities/[id]/uploads — firmanın yükleme geçmişi (dosya saklandıysa yeniden işlenebilir)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })
  const { id } = await params
  const entity = await prisma.entity.findFirst({ where: { id, userId }, select: { id: true } })
  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const rows = await prisma.financialDataUpload.findMany({
    where: { entityId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, year: true, period: true, source: true, fileName: true, parsedFieldCount: true, createdAt: true, fileUrl: true, fileSize: true },
  })
  return jsonUtf8({
    uploads: rows.map(r => ({ ...r, stored: !!r.fileUrl, fileUrl: undefined })),
  })
}
