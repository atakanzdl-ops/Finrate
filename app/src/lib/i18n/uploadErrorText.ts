/**
 * uploadErrorText.ts — Yükleme hatalarını kullanıcıya okunur Türkçe ile anlatır.
 *
 * Sunucu bazen teknik kod (MISSING_YEAR_CONTEXT, application/zip, correlationId…)
 * veya hiç JSON olmayan gövde (Vercel 413/504) döner. Bu yardımcı, HTTP durumu ve
 * gövdeden tek bir sade cümle üretir. İstemci tarafında çalışır (prisma yok).
 */

export interface UploadErrorBody {
  error?:         unknown
  message?:       unknown
  correlationId?: unknown
}

const CODE_TEXT: Record<string, string> = {
  MISSING_YEAR_CONTEXT:  'Dosyada yıl bilgisi bulunamadı. Yıl seçip tekrar deneyin.',
  YEAR_MISMATCH:         'Dosyadaki yıl, seçtiğiniz yıl ile uyuşmuyor.',
  PERIOD_MISMATCH:       'Dosyadaki dönem, seçtiğiniz dönem ile uyuşmuyor.',
  DUPLICATE_DATA:        'Bu dönem için aynı türde dosya zaten yüklenmiş.',
  FREE_EXPIRED:          '14 günlük ücretsiz deneme süreniz doldu. Devam etmek için bir paket gerekir.',
  NO_CREDITS:            'Analiz hakkınız kalmadı. Yeni dönem yüklemek için paket gerekir.',
  CREDITS_EXPIRED:       'Paketinizin geçerlilik süresi doldu. Devam etmek için paket yenileyin.',
  ENTITY_TAX_NUMBER_MISMATCH: 'Dosya başka bir firmaya ait görünüyor.',
}

const STATUS_TEXT: Record<number, string> = {
  401: 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
  403: 'Bu işlem için yetkiniz yok.',
  404: 'Şirket bulunamadı. Sayfayı yenileyip tekrar deneyin.',
  413: 'Dosya çok büyük. Lütfen 10 MB\'tan küçük bir dosya yükleyin.',
  415: 'Bu dosya türü desteklenmiyor. Excel (.xlsx/.xls), CSV veya PDF yükleyin.',
  429: 'Çok sık istek gönderildi. Bir dakika bekleyip tekrar deneyin.',
  500: 'Dosya işlenirken bir sorun oluştu. Lütfen tekrar deneyin.',
  502: 'Sunucu şu an yanıt vermiyor. Biraz sonra tekrar deneyin.',
  503: 'Sunucu şu an yanıt vermiyor. Biraz sonra tekrar deneyin.',
  504: 'Dosya işleme zaman aşımına uğradı. Daha küçük bir dosyayla tekrar deneyin.',
}

/** Sunucu metnindeki teknik kalıpları sadeleştirir. */
function humanizeServerText(text: string): string {
  const t = text.trim()
  if (/uzantıyla uyumsuz/i.test(t)) {
    return 'Dosyanın içeriği uzantısıyla uyuşmuyor. Dosyayı Excel veya PDF olarak yeniden kaydedip tekrar yükleyin.'
  }
  if (/parse edildi|işlenebilir yıl\/dönem/i.test(t)) {
    return 'Dosya okundu ancak yıl/dönem bilgisi çıkarılamadı. Yıl ve dönemi seçip tekrar deneyin.'
  }
  if (/okunabilir veri bulunamadı/i.test(t)) {
    return 'Dosyada okunabilir mali veri bulunamadı. Mizan veya beyanname dosyası olduğundan emin olun.'
  }
  if (/geçersiz dosya türü/i.test(t)) {
    return 'Bu dosya türü desteklenmiyor. Excel (.xlsx/.xls), CSV veya PDF yükleyin.'
  }
  if (/dosya işlenirken hata/i.test(t)) {
    return STATUS_TEXT[500]
  }
  return t
}

/** Büyük harf + alt çizgi biçimindeki teknik kod mu? */
function looksLikeCode(s: string): boolean {
  return /^[A-Z][A-Z0-9_]{3,}$/.test(s.trim())
}

/**
 * HTTP durumu ve sunucu gövdesinden okunur hata cümlesi üretir.
 * Öncelik: bilinen kod → sunucu mesajı (sadeleştirilmiş) → durum kodu → genel.
 */
export function describeUploadError(status: number, body: UploadErrorBody | null | undefined): string {
  const code    = typeof body?.error   === 'string' ? body.error   : ''
  const message = typeof body?.message === 'string' ? body.message : ''
  const ref     = typeof body?.correlationId === 'string' ? body.correlationId : ''

  // 1) Bilinen teknik kod
  if (code && CODE_TEXT[code]) {
    // Sunucu daha açıklayıcı bir cümle göndermişse (ör. "2024 yılı için, formda 2023") onu koru.
    const text = message && !looksLikeCode(message) ? message : CODE_TEXT[code]
    return text
  }

  // 2) Sunucu düz Türkçe mesaj göndermiş
  const serverText = message && !looksLikeCode(message) ? message : (code && !looksLikeCode(code) ? code : '')
  if (serverText) {
    const text = humanizeServerText(serverText)
    return status >= 500 && ref ? `${text} (Destek kodu: ${ref.slice(0, 8)})` : text
  }

  // 3) Yalnızca durum kodu var (gövde JSON değil ya da boş)
  if (STATUS_TEXT[status]) {
    return status >= 500 && ref ? `${STATUS_TEXT[status]} (Destek kodu: ${ref.slice(0, 8)})` : STATUS_TEXT[status]
  }
  if (status >= 500) return STATUS_TEXT[500]
  if (status >= 400) return 'Yükleme yapılamadı. Dosyayı ve seçimleri kontrol edip tekrar deneyin.'
  return 'Yükleme başarısız. Lütfen tekrar deneyin.'
}

/** fetch() hiç yanıt alamadığında (ağ kesintisi vb.) */
export const UPLOAD_NETWORK_ERROR_TEXT = 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
