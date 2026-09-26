import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { readStoredFile } from '@/lib/fileStorage'
import { POST as uploadPOST } from '@/app/api/entities/[id]/upload/route'

/**
 * POST /api/entities/[id]/uploads/[uploadId]/reprocess
 * Saklanan dosyayı yeniden okuyup aynı yükleme akışından geçirir (parser düzeltmeleri uygulanır,
 * aynı dönem olduğu için hak düşmez). Yükleme kaydı yeni bir satır olarak eklenir.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; uploadId: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })
  const { id, uploadId } = await params

  const entity = await prisma.entity.findFirst({ where: { id, userId }, select: { id: true } })
  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const up = await prisma.financialDataUpload.findFirst({ where: { id: uploadId, entityId: id } })
  if (!up) return jsonUtf8({ error: 'Yükleme kaydı bulunamadı.' }, { status: 404 })
  if (!up.fileUrl) return jsonUtf8({ error: 'Bu yüklemenin dosyası saklanmamış; yeniden işlemek için dosyayı tekrar yükleyin.' }, { status: 409 })

  const buffer = await readStoredFile(up.fileUrl)
  if (!buffer) return jsonUtf8({ error: 'Saklanan dosya okunamadı.' }, { status: 502 })

  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(buffer)], { type: up.mimeType ?? 'application/octet-stream' }), up.fileName)
  fd.append('year', String(up.year))
  fd.append('period', up.period)
  fd.append('overwrite', 'true')
  fd.append('confirmDetectionMissing', 'true')
  fd.append('confirmEntityUnverified', 'true')

  const origin = new URL(req.url).origin
  const synthetic = new NextRequest(`${origin}/api/entities/${id}/upload`, {
    method: 'POST',
    body: fd,
    headers: {
      cookie: req.headers.get('cookie') ?? '',
      authorization: req.headers.get('authorization') ?? '',
    },
  })
  return uploadPOST(synthetic, { params: Promise.resolve({ id }) })
}
