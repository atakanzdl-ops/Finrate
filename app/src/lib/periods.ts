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
