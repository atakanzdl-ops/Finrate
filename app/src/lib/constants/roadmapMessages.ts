export const ROADMAP_ERROR_CODES = {
  ROADMAP_REQUIRED: 'ROADMAP_REQUIRED',
  ROADMAP_STALE:    'ROADMAP_STALE',
} as const

export const ROADMAP_MESSAGES = {
  ROADMAP_REQUIRED:
    'Rapor oluşturmak için önce Akıllı Yol Haritası oluşturmanız gerekir. Senaryo sekmesinden "Yol Haritası Oluştur" butonunu kullanın.',

  ROADMAP_STALE:
    'Akıllı Yol Haritası güncel değil. Lütfen senaryo sekmesinden yeniden oluşturun.',

  BUTTON_DISABLED_TOOLTIP: 'Önce Akıllı Yol Haritası oluşturun',

  BANNER_CTA: "Yol Haritası'na Git",

  BANNER_TEXT: 'Rapor üretmek için önce Akıllı Yol Haritası oluşturun.',

  // Subjektif faktörler (KKB, banka ilişkileri, kurumsal yapı, uyum) girilmeden rapor üretilmez:
  // 30 puanlık subjektif skor olmadan toplam skor ve rating eksik kalır.
  SUBJECTIVE_REQUIRED:
    'Rapor oluşturmak için önce Subjektif Faktörler girilmelidir. Subjektif sekmesinden KKB, banka ilişkileri, kurumsal yapı ve uyum bilgilerini doldurup kaydedin.',
  SUBJECTIVE_BANNER_TEXT: 'Subjektif faktörler girilmeden rapor ve nihai skor oluşmaz.',
  SUBJECTIVE_BANNER_CTA: 'Subjektif Sekmesine Git',
  SUBJECTIVE_BUTTON_DISABLED_TOOLTIP: 'Önce subjektif faktörleri girin',
} as const

export const ROADMAP_ERROR_CODES_EXT = {
  SUBJECTIVE_REQUIRED: 'SUBJECTIVE_REQUIRED',
} as const

export type RoadmapErrorCode = typeof ROADMAP_ERROR_CODES[keyof typeof ROADMAP_ERROR_CODES]
