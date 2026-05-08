/**
 * uploadErrors.ts — Upload validasyon Türkçe hata mesajları (Faz 7.3.50A)
 */

export const UPLOAD_ERRORS = {
  MISSING_YEAR_CONTEXT:
    'Dosyada yıl bilgisi bulunamadı ve formda yıl seçilmedi. Lütfen yıl seçin veya yıl bilgisi olan bir dosya yükleyin.',

  YEAR_MISMATCH: (detected: number, form: number): string =>
    `Yüklediğiniz dosya ${detected} yılı için, formda ${form} seçtiniz.`,

  PERIOD_MISMATCH: (detected: string, form: string): string =>
    `Yüklediğiniz dosya ${detected} dönemi için, formda ${form} seçtiniz.`,

  DUPLICATE_DATA: (count: number): string =>
    `${count} dönem için aynı kaynaktan veri zaten var. Üzerine yazmak ister misiniz?`,
} as const
