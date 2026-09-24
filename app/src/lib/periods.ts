export const PERIOD_ORDER: Record<string, number> = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
  ANNUAL: 5,
}

export const PERIOD_LABEL: Record<string, string> = {
  Q1: '1.DÖNEM',
  Q2: '2.DÖNEM',
  Q3: '3.DÖNEM',
  Q4: '4.DÖNEM',
  ANNUAL: 'YILLIK',
}

// Geçici vergi dönemleri kümülatiftir (Q2 = Ocak–Haziran); etiketler bunu açıkça söyler.
export const PERIOD_LABEL_LONG: Record<string, string> = {
  ANNUAL: 'Yıllık (Kesin)',
  Q1: '3 Aylık (1. Geçici)',
  Q2: '6 Aylık (2. Geçici)',
  Q3: '9 Aylık (3. Geçici)',
  Q4: '12 Aylık (4. Geçici)',
}

export const PERIOD_LABEL_SHORT: Record<string, string> = {
  ANNUAL: 'Yıllık',
  Q1: '3 Aylık',
  Q2: '6 Aylık',
  Q3: '9 Aylık',
  Q4: '12 Aylık',
}

export const PERIOD_LABEL_AXIS: Record<string, string> = {
  ANNUAL: '',
  Q1: '3A',
  Q2: '6A',
  Q3: '9A',
  Q4: '12A',
}

export const PERIOD_MONTHS: Record<string, number> = {
  Q1: 3, Q2: 6, Q3: 9, Q4: 12, ANNUAL: 12,
}

export function periodLabelLong(year: number, period: string): string {
  return `${year} · ${PERIOD_LABEL_LONG[period] ?? period}`
}

export function periodLabelAxis(year: number, period: string): string {
  const p = PERIOD_LABEL_AXIS[period]
  return p ? `${year}/${p}` : String(year)
}

export function sortPeriods<T extends { year: number; period: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return (PERIOD_ORDER[a.period] ?? 99) - (PERIOD_ORDER[b.period] ?? 99)
  })
}

export function formatReportPeriodLabel(year: number, period: string): string {
  return `${year} ${PERIOD_LABEL[period] ?? period}`
}

export function shortPeriodLabel(period: string): string {
  if (period === 'ANNUAL') return ''
  return PERIOD_LABEL[period] ?? ''
}
