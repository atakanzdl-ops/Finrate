import { RATING_BANDS, scoreToRating } from '@/lib/scoring/score'

// Ortaklara borçlar (331+431) / özkaynak eşikleri — config/methodology.ts bunları buradan okur.
//   > WARN → İzleme Alanı uyarısı;  > CAP → rating tavanı bir kademe düşer
export const SHAREHOLDER_LOAN_WARN_RATIO = 0.25
export const SHAREHOLDER_LOAN_CAP_RATIO  = 0.50

export interface GuardrailNote {
  code: 'SHAREHOLDER_LOANS'
  level: 'WARN' | 'CAP'
  ratio: number
  amount: number
  message: string
}

export interface GuardrailResult {
  financialScore: number
  notes: GuardrailNote[]
  shareholderLoans: number
  shareholderLoanToEquity: number | null
}

const SHAREHOLDER_LOAN_CODES = ['331', '431']

export function sumShareholderLoans(accounts: Array<{ accountCode?: string; code?: string; amount: number | string }>): number {
  return accounts
    .filter(a => SHAREHOLDER_LOAN_CODES.includes(a.accountCode ?? a.code ?? ''))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0)
}

/** Skoru bir üst bandın altına çeker: rating bir kademe düşer (band alt sınırı − 1). */
function capOneNotch(score: number): number {
  const rating = scoreToRating(score)
  const idx = RATING_BANDS.findIndex(b => b.label === rating)
  if (idx < 0 || idx >= RATING_BANDS.length - 1) return score
  const cap = RATING_BANDS[idx].min - 1
  return Math.min(score, cap)
}

const fmtMn = (v: number) => `${(v / 1_000_000).toFixed(1).replace('.', ',')} Mn TL`

/**
 * Ortaklara borçlar guardrail'i. Skor motoruna dokunmaz; calculateScore SONRASINDA uygulanır.
 * Özkaynak ≤ 0 ise oran anlamsız → sadece tutar notu, tavan uygulanmaz (negatif özkaynak zaten kendi tavanını taşır).
 */
export function applyGuardrails(
  financialScore: number,
  ctx: { accounts: Array<{ accountCode?: string; code?: string; amount: number | string }>; totalEquity: number | null | undefined },
): GuardrailResult {
  const shareholderLoans = sumShareholderLoans(ctx.accounts)
  const equity = ctx.totalEquity != null ? Number(ctx.totalEquity) : null
  const ratio = shareholderLoans > 0 && equity != null && equity > 0 ? shareholderLoans / equity : null
  const notes: GuardrailNote[] = []
  let score = financialScore

  if (ratio != null && ratio > SHAREHOLDER_LOAN_CAP_RATIO) {
    score = capOneNotch(score)
    notes.push({
      code: 'SHAREHOLDER_LOANS', level: 'CAP', ratio, amount: shareholderLoans,
      message: `Ortaklara borçlar ${fmtMn(shareholderLoans)}; özkaynağa oranı %${Math.round(ratio * 100)}. Özkaynağın yarısını aştığı için rating tavanı bir kademe düşürüldü. Ortak tarafından çekilmesi halinde likidite ve kaldıraç bozulur; sermayeye ilavesi önerilir.`,
    })
  } else if (ratio != null && ratio > SHAREHOLDER_LOAN_WARN_RATIO) {
    notes.push({
      code: 'SHAREHOLDER_LOANS', level: 'WARN', ratio, amount: shareholderLoans,
      message: `Ortaklara borçlar ${fmtMn(shareholderLoans)}; özkaynağa oranı %${Math.round(ratio * 100)}. Ortak tarafından çekilmesi halinde likidite ve kaldıraç bozulur; sermayeye ilavesi önerilir.`,
    })
  }

  return { financialScore: score, notes, shareholderLoans, shareholderLoanToEquity: ratio }
}
