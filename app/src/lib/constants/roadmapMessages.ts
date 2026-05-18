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
} as const

export type RoadmapErrorCode = typeof ROADMAP_ERROR_CODES[keyof typeof ROADMAP_ERROR_CODES]
