'use client'

/**
 * AccountImpactTable (Faz 7.3.48)
 *
 * Aksiyon başına hesap kodu detay tablosu.
 *   - Bilanço hesapları (ASSET/LIABILITY/EQUITY):
 *     Kod | Hesap | Mevcut | Önerilen | Δ
 *   - Akış hesapları (INCOME/EXPENSE):
 *     Dönem Etkisi satırı
 *   - 690 kapanış hesabı → GİZLENİR
 *
 * import type disiplini:
 *   AccountingImpactRow sadece `import type` — decisionLayer
 *   runtime import EDİLMEZ (client bundle temiz kalır).
 *
 * Side kuralları (TDHP):
 *   ASSET     (1xx/2xx):  DEBIT  → artar,  CREDIT → azalır
 *   LIABILITY (3xx/4xx):  CREDIT → artar,  DEBIT  → azalır
 *   EQUITY    (5xx):      CREDIT → artar,  DEBIT  → azalır
 *   INCOME    (600 vb):   CREDIT → dönem gelir etkisi
 *   EXPENSE   (610-689):  DEBIT  → dönem gider etkisi
 */

import type { AccountingImpactRow } from '@/lib/scoring/scenarioV3/decisionLayer'
import { CHART_OF_ACCOUNTS } from '@/lib/scoring/chartOfAccounts'

// ─── Yardımcı (test edilebilir export) ───────────────────────────────────────

/** ₺ para birimi formatı: 1.5M, 250K, 500, negatif dahil */
export function formatTRY(n: number): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}₺${(abs / 1_000_000_000).toFixed(1)}Mr`
  if (abs >= 1_000_000)     return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${sign}₺${(abs / 1_000).toFixed(0)}K`
  return `${sign}₺${abs.toFixed(0)}`
}

/** Hesap kodu → TDHP side (UPPERCASE). Fallback: prefix bazlı */
export function getAccountSide(
  code: string,
): 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' {
  const acc = CHART_OF_ACCOUNTS[code]
  if (acc) return acc.side
  // Fallback by leading digit
  const p = code.charAt(0)
  if (p === '1' || p === '2') return 'ASSET'
  if (p === '3' || p === '4') return 'LIABILITY'
  if (p === '5') return 'EQUITY'
  if (p === '6') return 'INCOME'
  return 'EXPENSE'
}

/**
 * Önerilen bakiye hesaplar.
 *
 * @param current  - mevcut hesap bakiyesi
 * @param legSide  - 'DEBIT' | 'CREDIT'
 * @param side     - hesap türü (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE)
 * @param amount   - aksiyon tutarı (pozitif)
 */
export function getProposedBalance(
  current:  number,
  legSide:  'DEBIT' | 'CREDIT',
  side:     'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
  amount:   number,
): number {
  const increases =
    (side === 'ASSET'     && legSide === 'DEBIT')  ||
    (side === 'LIABILITY' && legSide === 'CREDIT') ||
    (side === 'EQUITY'    && legSide === 'CREDIT')
  return increases ? current + amount : current - amount
}

/**
 * Collapsed başlık Δ özeti — çift saymaz.
 *
 * Öncelik: actionAmountTRY → max(sumDebit, sumCredit).
 * ASLA sumDebit + sumCredit (çift taraflı fişte yanıltıcı).
 */
export function computeDelta(
  legs:            AccountingImpactRow[],
  actionAmountTRY?: number,
): number {
  if (actionAmountTRY != null && actionAmountTRY > 0) return actionAmountTRY
  const sumDebit  = legs.filter(l => l.legSide === 'DEBIT') .reduce((s, l) => s + l.amountTRY, 0)
  const sumCredit = legs.filter(l => l.legSide === 'CREDIT').reduce((s, l) => s + l.amountTRY, 0)
  return Math.max(sumDebit, sumCredit)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Birleşik leg dizisi (debits + credits) — AccountingImpactRow.legSide ile ayrım yapılır */
  legs:             AccountingImpactRow[]
  /** Firma mevcut hesap bakiyeleri — route'tan currentAccountBalances */
  currentBalances:  Record<string, number>
  /** Aksiyon tutarı — Δ özeti hesabı için (opsiyonel) */
  actionAmountTRY?: number
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export function AccountImpactTable({ legs, currentBalances }: Props) {
  // 690 kapanış hesabını gizle
  const filtered = legs.filter(l => l.accountCode !== '690')

  if (filtered.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>
        Hesap detayı mevcut değil
      </p>
    )
  }

  // Bilanço (ASSET/LIABILITY/EQUITY) vs Akış (INCOME/EXPENSE) ayrımı
  const balanceLegs = filtered.filter(l => {
    const s = getAccountSide(l.accountCode)
    return s === 'ASSET' || s === 'LIABILITY' || s === 'EQUITY'
  })
  const flowLegs = filtered.filter(l => {
    const s = getAccountSide(l.accountCode)
    return s === 'INCOME' || s === 'EXPENSE'
  })

  // Her iki bölüm de boş (beklenmedik hesap kodu aralığı)
  if (balanceLegs.length === 0 && flowLegs.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#94A3B8' }}>
        Etkilenmez
      </p>
    )
  }

  return (
    <div style={{ fontSize: 13 }}>

      {/* ── Bilanço bölümü ────────────────────────────────────────────── */}
      {balanceLegs.length > 0 && (
        <div style={{ marginBottom: flowLegs.length > 0 ? 14 : 0 }}>
          {/* Sütun başlıkları */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: '56px 1fr 80px 80px 64px',
            gap:                 6,
            marginBottom:        5,
            fontSize:            10,
            color:               '#94A3B8',
            fontWeight:          600,
            textTransform:       'uppercase' as const,
            letterSpacing:       0.4,
          }}>
            <span>Kod</span>
            <span>Hesap</span>
            <span style={{ textAlign: 'right' as const }}>Mevcut</span>
            <span style={{ textAlign: 'right' as const }}>Önerilen</span>
            <span style={{ textAlign: 'right' as const }}>Δ</span>
          </div>

          {balanceLegs.map((leg, i) => {
            const side     = getAccountSide(leg.accountCode)
            const current  = currentBalances[leg.accountCode] ?? 0
            const proposed = getProposedBalance(current, leg.legSide, side, leg.amountTRY)
            const delta    = proposed - current
            const isPos    = delta >= 0

            return (
              <div
                key={i}
                style={{
                  display:             'grid',
                  gridTemplateColumns: '56px 1fr 80px 80px 64px',
                  gap:                 6,
                  background:          isPos ? '#F0FDFA' : '#FEF2F2',
                  borderRadius:        6,
                  padding:             '7px 10px',
                  marginBottom:        4,
                  alignItems:          'center',
                }}
              >
                <span style={{ fontFamily: 'monospace', color: '#94A3B8', fontSize: 11 }}>
                  {leg.accountCode}
                </span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>
                  {leg.accountName}
                </span>
                <span style={{ textAlign: 'right' as const, color: '#64748B' }}>
                  {formatTRY(current)}
                </span>
                <span style={{ textAlign: 'right' as const, color: '#1E293B', fontWeight: 600 }}>
                  {formatTRY(proposed)}
                </span>
                <span style={{
                  textAlign:  'right' as const,
                  fontWeight: 700,
                  color:      isPos ? '#0F766E' : '#B91C1C',
                }}>
                  {isPos ? '+' : ''}{formatTRY(delta)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Akış (dönem etkisi) bölümü ───────────────────────────────── */}
      {flowLegs.length > 0 && (
        <div>
          <p style={{
            margin:          '0 0 6px',
            fontSize:        10,
            color:           '#94A3B8',
            textTransform:   'uppercase' as const,
            letterSpacing:   0.4,
            fontWeight:      600,
          }}>
            Dönem Etkisi
          </p>

          {flowLegs.map((leg, i) => {
            const side       = getAccountSide(leg.accountCode)
            const isIncrease =
              (side === 'INCOME'  && leg.legSide === 'CREDIT') ||
              (side === 'EXPENSE' && leg.legSide === 'DEBIT')

            return (
              <div
                key={i}
                style={{
                  background:     isIncrease ? '#F0FDFA' : '#FEF2F2',
                  borderRadius:   6,
                  padding:        '7px 10px',
                  marginBottom:   4,
                  display:        'flex',
                  justifyContent: 'space-between',
                  alignItems:     'center',
                }}
              >
                <div>
                  <span style={{ fontFamily: 'monospace', color: '#94A3B8', fontSize: 11, marginRight: 6 }}>
                    {leg.accountCode}
                  </span>
                  <span style={{ color: isIncrease ? '#115E59' : '#991B1B', fontWeight: 500 }}>
                    {leg.accountName}
                  </span>
                </div>
                <span style={{
                  fontWeight:  600,
                  color:       isIncrease ? '#0F766E' : '#B91C1C',
                  whiteSpace:  'nowrap' as const,
                }}>
                  {isIncrease ? '+' : '−'}{formatTRY(leg.amountTRY)}
                </span>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
