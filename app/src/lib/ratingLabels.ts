// Tek rating etiket sözlüğü — site, rapor ve metodoloji sayfası buradan okur.
export const RATING_LABEL: Record<string, string> = {
  AAA: 'Mükemmel',
  AA:  'Yüksek',
  A:   'İyi',
  BBB: 'Yeterli',
  BB:  'Spekülatif',
  B:   'Riskli',
  CCC: 'Çok Riskli',
  CC:  'Kritik',
  C:   'Kritik',
  D:   'Temerrüt',
}

export function ratingLabel(rating: string | null | undefined): string {
  if (!rating) return '—'
  return RATING_LABEL[rating.toUpperCase().replace(/[+-]$/, '')] ?? rating
}
