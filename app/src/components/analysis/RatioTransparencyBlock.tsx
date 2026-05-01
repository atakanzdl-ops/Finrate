'use client'

import type {
  RatioTransparency,
  BalanceRatioTransparency,
  MarginRatioTransparency,
  TurnoverRatioTransparency,
} from '@/lib/scoring/scenarioV3/contracts'

type Props = {
  data: RatioTransparency
}

// ─── Formatlayıcılar ──────────────────────────────────────────────────────────

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mn`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} K`
  return `${n.toFixed(0)}`
}

function formatPercent(n: number): string {
  return `%${(n * 100).toFixed(1)}`
}

function formatTurnover(n: number): string {
  return `${n.toFixed(2)}x`
}

// ─── Ortak 3 satır (Bugünkü / Gerçekçi 12 ay / TCMB sektör) ─────────────────

function RatioRows({
  current,
  realisticTarget,
  sectorMedian,
  currentLabel = 'Bugünkü',
}: {
  current: string
  realisticTarget: string
  sectorMedian: string
  currentLabel?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8', flexShrink: 0 }} />
          {currentLabel}
        </span>
        <span style={{ color: '#0B3C5D', fontWeight: 500 }}>{current}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EC4B6', flexShrink: 0 }} />
          Gerçekçi 12 ay
        </span>
        <span style={{ color: '#2EC4B6', fontWeight: 500 }}>{realisticTarget}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0B3C5D', flexShrink: 0 }} />
          TCMB sektör
        </span>
        <span style={{ color: '#0B3C5D', fontWeight: 500 }}>{sectorMedian}</span>
      </div>

    </div>
  )
}

// ─── Formül satırı ────────────────────────────────────────────────────────────

const formulaRowStyle = {
  margin: '12px 0 0',
  paddingTop: 10,
  borderTop: '1px dashed #E5E9F0',
  fontSize: 11,
  color: '#94A3B8',
  fontFamily: 'monospace',
  fontStyle: 'italic' as const,
}

const titleStyle = {
  margin: '0 0 12px',
  fontSize: 11,
  color: '#64748B',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  fontWeight: 500,
}

// ─── Balance branch (A05 — mevcut render BIREBIR korunur) ────────────────────

function renderBalanceBlock(data: BalanceRatioTransparency) {
  const formula = data.formula
  return (
    <div>
      <p style={titleStyle}>Hedef</p>

      <RatioRows
        current={formatAmount(data.currentBalance)}
        realisticTarget={formatAmount(data.realisticTarget)}
        sectorMedian={formatAmount(data.sectorMedian)}
      />

      <p style={formulaRowStyle}>
        {formula.targetLabel} = ({formula.basisLabel} × {formula.targetDays}) / {formula.periodDays}
      </p>
    </div>
  )
}

// ─── Margin branch (A12 brüt marj — yüzde formatı) ───────────────────────────

function renderMarginBlock(data: MarginRatioTransparency) {
  return (
    <div>
      <p style={titleStyle}>{data.metricLabel}</p>

      <RatioRows
        current={formatPercent(data.current)}
        realisticTarget={formatPercent(data.realisticTarget)}
        sectorMedian={formatPercent(data.sectorMedian)}
      />

      <p style={formulaRowStyle}>{data.formula.description}</p>
    </div>
  )
}

// ─── Turnover branch (faaliyet devri — Xx formatı) ───────────────────────────

function renderTurnoverBlock(data: TurnoverRatioTransparency) {
  return (
    <div>
      <p style={titleStyle}>{data.metricLabel}</p>

      <RatioRows
        current={formatTurnover(data.current)}
        realisticTarget={formatTurnover(data.realisticTarget)}
        sectorMedian={formatTurnover(data.sectorMedian)}
        currentLabel="Bu aksiyon öncesi"
      />

      <p style={formulaRowStyle}>{data.formula.description}</p>
    </div>
  )
}

// ─── Ana bileşen — kind discriminator ────────────────────────────────────────

export function RatioTransparencyBlock({ data }: Props) {
  if (data.kind === 'margin')   return renderMarginBlock(data)
  if (data.kind === 'turnover') return renderTurnoverBlock(data)
  // kind === undefined veya 'balance' → BalanceRatioTransparency (A05 geriye uyum)
  return renderBalanceBlock(data as BalanceRatioTransparency)
}
