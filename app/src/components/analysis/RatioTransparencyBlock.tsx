'use client'

import type { RatioTransparency } from '@/lib/scoring/scenarioV3/contracts'

type Props = {
  data: RatioTransparency
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mn`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} K`
  return `${n.toFixed(0)}`
}

export function RatioTransparencyBlock({ data }: Props) {
  const formula = data.formula

  return (
    <div>
      {/* HEDEF başlık */}
      <p style={{
        margin: '0 0 12px',
        fontSize: 11,
        color: '#64748B',
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        fontWeight: 500,
      }}>
        Hedef
      </p>

      {/* 3 satır liste */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>

        {/* Bugünkü */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8', flexShrink: 0 }} />
            Bugünkü
          </span>
          <span style={{ color: '#0B3C5D', fontWeight: 500 }}>
            {formatAmount(data.currentBalance)}
          </span>
        </div>

        {/* Gerçekçi 12 ay */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EC4B6', flexShrink: 0 }} />
            Gerçekçi 12 ay
          </span>
          <span style={{ color: '#2EC4B6', fontWeight: 500 }}>
            {formatAmount(data.realisticTarget)}
          </span>
        </div>

        {/* TCMB sektör */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0B3C5D', flexShrink: 0 }} />
            TCMB sektör
          </span>
          <span style={{ color: '#0B3C5D', fontWeight: 500 }}>
            {formatAmount(data.sectorMedian)}
          </span>
        </div>

      </div>

      {/* Formül satırı */}
      <p style={{
        margin: '12px 0 0',
        paddingTop: 10,
        borderTop: '1px dashed #E5E9F0',
        fontSize: 11,
        color: '#94A3B8',
        fontFamily: 'monospace',
        fontStyle: 'italic',
      }}>
        {formula.targetLabel} = ({formula.basisLabel} × {formula.targetDays}) / {formula.periodDays}
      </p>
    </div>
  )
}
