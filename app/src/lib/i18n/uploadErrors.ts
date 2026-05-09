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

  DETECTED_YEAR_MISSING_CONFIRM: (formYear: number): string =>
    `Dosyada yıl bilgisi bulunamadı. Formda seçtiğiniz ${formYear} yılına kaydedilecek. Onaylıyor musunuz?`,

  // ─── Faz 7.3.50A.3 — Entity Identity ──────────────────────────────────────

  ENTITY_TAX_NUMBER_MISMATCH: (detectedName: string, entityName: string): string =>
    `Yüklediğiniz dosya "${detectedName}" firmasına ait. Bu sayfa "${entityName}" firması için.`,

  ENTITY_TAX_UNVERIFIED_CONFIRM: (detectedVkn: string, entityName: string): string =>
    `Dosyada VKN ${detectedVkn} bulundu, ancak "${entityName}" firması için kayıtlı VKN yok. Karşılaştırma yapılamıyor. Yine de devam etmek ister misiniz?`,

  ENTITY_TC_UNVERIFIED_CONFIRM: (entityName: string): string =>
    `Dosyada TC Kimlik bulundu ancak sistemde TC karşılaştırması yapılamıyor. "${entityName}" firmasına kaydedilecek. Onaylıyor musunuz?`,

  ENTITY_TITLE_MISMATCH_CONFIRM: (detectedTitle: string, entityName: string): string =>
    `Dosyada görünen firma adı "${detectedTitle}", bu sayfa "${entityName}" firması için. Yine de devam etmek ister misiniz?`,

  ENTITY_UNVERIFIED_CONFIRM: (entityName: string): string =>
    `Dosyada firma bilgisi bulunamadı. "${entityName}" firmasına kaydedilecek. Onaylıyor musunuz?`,
} as const
