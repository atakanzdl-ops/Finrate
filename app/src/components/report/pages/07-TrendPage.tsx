'use client'
import type { ReportData, TrendChart, GrowthTableRow } from '@/types/report'
import { shortPeriodLabel } from '@/lib/periods'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'trends'>
  sector?: string
}

function MiniBarChart({ chart }: { chart: TrendChart }) {
  const maxH = 72  // px — bar yüksekliği maksimum

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0a192f', marginBottom: '2px' }}>{chart.title}</div>
      <div style={{ fontSize: '7.5px', color: '#94a3b8', marginBottom: '12px' }}>{chart.subtitle}</div>

      {/* Çubuk grubu — T14: sabit 14px bar genişliği (referans baz) */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: `${maxH + 16}px` }}>
        {chart.bars.map((bar, bi) => {
          const periodLbl = shortPeriodLabel(bar.period)
          return (
            <div key={bi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              {/* Sütunlar yan yana */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: `${maxH}px` }}>
                {bar.columns.map((col, ci) => (
                  <div key={ci} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {/* Etiket */}
                    <div style={{ fontSize: '6.5px', color: '#64748b', marginBottom: '2px', textAlign: 'center', lineHeight: 1 }}>{col.label}</div>
                    {/* Bar — 14px sabit genişlik */}
                    <div style={{
                      width: '14px',
                      height: `${Math.max(3, col.value * maxH / 100)}px`,
                      background: col.color,
                      borderRadius: '3px 3px 0 0',
                    }} />
                  </div>
                ))}
              </div>
              {/* Yıl + dönem etiketi */}
              <div style={{ fontSize: '7px', color: bar.isCurrent ? '#0a192f' : '#94a3b8', fontWeight: bar.isCurrent ? 700 : 400, marginTop: '4px', textAlign: 'center', lineHeight: 1.3 }}>
                {bar.year}
                {periodLbl && (
                  <div style={{ fontSize: '6px', color: bar.isCurrent ? '#0284c7' : '#94a3b8' }}>
                    {periodLbl}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
        {chart.legendItems.map((li, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '7.5px', color: '#64748b' }}>
            <div style={{ width: '12px', height: '4px', background: li.color, borderRadius: '2px' }} />
            {li.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function GrowthRow({ row }: { row: GrowthTableRow }) {
  return (
    <tr>
      <td style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '10px' }}>{row.label}</td>
      {row.values.map((v, i) => {
        const isCurrent = row.isCurrentFlags?.[i] ?? false
        return (
          <td key={i} style={isCurrent ? { fontWeight: 700, color: '#0a192f', background: '#f0f9ff' } : undefined}>
            {v}
          </td>
        )
      })}
      <td style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
        color: row.growthColor ?? '#0a192f',
        textAlign: 'right',
      }}>
        {row.growth4y ?? '—'}
      </td>
    </tr>
  )
}

export default function TrendPage({ data, sector }: Props) {
  const { companyName, reportNo, trends } = data
  const { charts, growthTable } = trends

  const growth0    = growthTable[0]
  const years      = growth0?.years      ?? []
  const periods    = growth0?.periods    ?? []
  const isCurrentF = growth0?.isCurrentFlags ?? []

  return (
    <div className="pdf-page">
      <div className="wm">TREND</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 06</div><div className="ph-title">Trend Analizi</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 7</div></div>
      </div>
      <div className="pc">

        {/* 4 Mini Grafik */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {charts.slice(0, 4).map((c, i) => (
            <MiniBarChart key={i} chart={c} />
          ))}
        </div>

        {/* Büyüme Tablosu — T15: lacivert üst bantlı wrapper */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ background: '#0a192f', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px' }}>Finansal Büyüme Özeti</div>
            <div style={{ color: '#cbd5e1', fontSize: '11px' }}>Yıllık karşılaştırma</div>
          </div>
          <table className="pt" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metrik</th>
                {years.map((y, i) => {
                  const periodLbl = shortPeriodLabel(periods[i] ?? 'ANNUAL')
                  const isCurrent = isCurrentF[i] ?? false
                  return (
                    <th key={i} style={isCurrent ? { background: 'var(--fr-primary)', color: '#fff', fontWeight: 700 } : undefined}>
                      {y}
                      {periodLbl && (
                        <div style={{ fontSize: '6.5px', fontWeight: 400, color: '#0284c7', letterSpacing: 0 }}>
                          {periodLbl}
                        </div>
                      )}
                    </th>
                  )
                })}
                <th>4Y Büyüme</th>
              </tr>
            </thead>
            <tbody>
              {growthTable.map((row, i) => <GrowthRow key={i} row={row} />)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
