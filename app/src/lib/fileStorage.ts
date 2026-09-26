import { prisma } from '@/lib/db'

/**
 * Yüklenen mali dosyaların saklanması — Vercel Blob (private store "finrate-uploads").
 * BLOB_READ_WRITE_TOKEN yoksa (lokal geliştirme) sessizce atlanır; analiz akışı etkilenmez.
 * Amaç: parser düzeltmeleri sonrası "yeniden işle" ve kullanıcının ne yüklediğini görebilmesi.
 */

const hasToken = () => !!process.env.BLOB_READ_WRITE_TOKEN

function safeName(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120)
}

/** Dosyayı Blob'a yazar ve upload kaydına bağlar. Hata olursa null döner, akışı bozmaz. */
export async function storeUploadFile(opts: {
  uploadId: string
  entityId: string
  fileName: string
  buffer: Buffer
  contentType: string
}): Promise<string | null> {
  if (!hasToken()) return null
  try {
    const { put } = await import('@vercel/blob')
    const pathname = `uploads/${opts.entityId}/${opts.uploadId}-${safeName(opts.fileName)}`
    const res = await put(pathname, opts.buffer, { access: 'private', contentType: opts.contentType, addRandomSuffix: false })
    await prisma.financialDataUpload.update({
      where: { id: opts.uploadId },
      data: { fileUrl: res.url, fileSize: opts.buffer.length, mimeType: opts.contentType },
    })
    return res.url
  } catch (err) {
    console.error('[fileStorage] dosya saklanamadı:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Saklanan dosyayı okur (private blob). */
export async function readStoredFile(url: string): Promise<Buffer | null> {
  if (!hasToken()) return null
  try {
    const { get } = await import('@vercel/blob')
    const res = await get(url, { access: 'private' })
    if (!res || res.statusCode !== 200 || !res.stream) return null
    const ab = await new Response(res.stream).arrayBuffer()
    return Buffer.from(ab)
  } catch (err) {
    console.error('[fileStorage] dosya okunamadı:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Dönem/firma silinirken saklanan dosyaları da temizler. */
export async function deleteStoredFiles(urls: Array<string | null | undefined>): Promise<void> {
  const list = urls.filter((u): u is string => !!u)
  if (!hasToken() || list.length === 0) return
  try {
    const { del } = await import('@vercel/blob')
    await del(list)
  } catch (err) {
    console.error('[fileStorage] dosya silinemedi:', err instanceof Error ? err.message : err)
  }
}
