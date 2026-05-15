'use client'
import type { ReportData, WaterfallBar } from '@/types/report'
import { fmtSigned } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'scenario'>
  sector?: string
}

function WaterfallChart({ bars }: { bars: WaterfallBar[] }) {
  const maxScore = Math.max(...bars.map(b => b.value), 100)
  const BASE_H = 120  // px maksimum yükseklik

  let cumulative = 0
  const enriched = bars.map(b => {
    const isBase   = b.type === 'base'
    const isDelta  = b.type === 'delta'
    const isTarget = b.type === 'target'
    const startAt  = isBase || isTarget ? 0 : cumulative
    const endAt    = isBase || isTarget ? b.value : cumulative + b.value
    if (isDelta) cumulative += b.value
    else if (isBase) cumulative = b.value
    return { ...b, startAt, endAt, isBase, isDelta, isTarget }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: `${BASE_H + 32}px`, padding: '0 8px' }}>
      {enriched.map((b, i) => {
        const h = Math.round((b.value / maxScore) * BASE_H)
        const bottom = b.isDelta ? Math.round((b.startAt / maxScore) * BASE_H) : 0
        const color = b.isBase ? '#0a192f' : b.isDelta ? '#2dd4bf' : b.isTarget === true && b.color?.includes('f59e0b') ? '#f59e0b' : '#22c55e'
        const lines = b.label.split('\n')
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Değer */}
            <div className="mono" style={{ fontSize: '8.5px', fontWeight: 800, color: '#0a192f', marginBottom: '3px' }}>
              {b.isDelta ? fmtSigned(b.value) : b.value}
            </div>
            {/* Bar */}
            <div style={{ position: 'relative', width: '100%', height: `${BASE_H}px` }}>
              <div style={{
                position: 'absolute',
                bottom: `${bottom}px`,
                left: 0,
                right: 0,
                height: `${Math.max(h, 6)}px`,
                background: color,
                borderRadius: b.isDelta ? '3px' : '6px 6px 0 0',
                opacity: b.isDelta ? 0.85 : 1,
              }} />
            </div>
            {/* Etiket */}
            <div style={{ marginTop: '4px', textAlign: 'center', fontSize: '7px', color: '#64748b', lineHeight: 1.3 }}>
              {lines.map((l, j) => <div key={j}>{l}</div>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ScenarioPage({ data, sector }: Props) {
  const { companyName, reportNo, scenario: sc } = data
  const { current, target1, target2, waterfall } = sc

  return (
    <div className="pdf-page">
      <div className="wm">SENARYO</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 10</div><div className="ph-title">Senaryo Analizi</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 11</div></div>
      </div>
      <div className="pc">

        {/* Mevcut Durum */}
        <div style={{ background: '#0a192f', borderRadius: '14px', padding: '18px 22px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '8.5px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>Mevcut Durum</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                <div className="outfit" style={{ fontSize: '48px', fontWeight: 900, color: '#2dd4bf', lineHeight: 1 }}>{current.rating}</div>
                <div className="outfit" style={{ fontSize: '32px', fontWeight: 800, color: 'white', lineHeight: 1 }}>{current.score}<span style={{ fontSize: '16px', color: '#475569' }}>/100</span></div>
              </div>
            </div>
            <div style={{ maxWidth: '300px', fontSize: '9px', color: '#94a3b8', lineHeight: 1.7 }}>{current.note}</div>
          </div>
        </div>

        {/* 2 Hedef Kart + Waterfall */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>

          {/* Hedef 1 */}
          <div style={{ border: '2px solid #22c55e', borderRadius: '12px', padding: '14px 16px', background: '#f0fdf4' }}>
            <div style={{ fontSize: '8px', color: '#166534', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', fontWeight: 700 }}>1. Hedef</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
              <div className="outfit" style={{ fontSize: '28px', fontWeight: 900, color: '#0a192f', lineHeight: 1 }}>{target1.rating}</div>
              <div className="outfit" style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e' }}>{fmtSigned(target1.delta)}</div>
            </div>
            <div style={{ fontSize: '8px', color: '#475569', marginBottom: '8px' }}>Süre: {target1.timeline}</div>
            <div style={{ borderTop: '1px solid #86efac', paddingTop: '8px' }}>
              {target1.actions.slice(0, 3).map((a, i) => (
                <div key={i} style={{ fontSize: '8px', color: '#334155', padding: '2px 0', display: 'flex', gap: '5px' }}>
                  <span style={{ color: '#22c55e', fontWeight: 700 }}>›</span>{a}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '7.5px', color: '#0369a1', background: '#e0f2fe', padding: '6px 8px', borderRadius: '6px' }}>{target1.planNote}</div>
          </div>

          {/* Hedef 2 */}
          <div style={{ border: '2px solid #f59e0b', borderRadius: '12px', padding: '14px 16px', background: '#fffbeb' }}>
            <div style={{ fontSize: '8px', color: '#92400e', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', fontWeight: 700 }}>2. Hedef</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
              <div className="outfit" style={{ fontSize: '28px', fontWeight: 900, color: '#0a192f', lineHeight: 1 }}>{target2.rating}</div>
              <div className="outfit" style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>{fmtSigned(target2.delta)}</div>
            </div>
            <div style={{ fontSize: '8px', color: '#475569', marginBottom: '8px' }}>Süre: {target2.timeline}</div>
            <div style={{ borderTop: '1px solid #fde68a', paddingTop: '8px' }}>
              {target2.actions.slice(0, 3).map((a, i) => (
                <div key={i} style={{ fontSize: '8px', color: '#334155', padding: '2px 0', display: 'flex', gap: '5px' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>›</span>{a}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '7.5px', color: '#92400e', background: '#fef9c3', padding: '6px 8px', borderRadius: '6px' }}>{target2.planNote}</div>
          </div>

          {/* Waterfall */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#0a192f', marginBottom: '10px' }}>Skor İlerlemesi</div>
            <WaterfallChart bars={waterfall} />
          </div>
        </div>

        {/* Değerlendirme */}
        <div className="ev">
          <div className="ev-t">Senaryo Değerlendirmesi</div>
          <div className="ev-tx">
            Mevcut {current.rating} ({current.score} puan) konumundan, belirlenen aksiyon planlarının hayata geçirilmesiyle {target1.rating} hedefine <strong style={{ color: 'white' }}>{target1.timeline}</strong> içinde ulaşılması öngörülmektedir. İkinci hedef olan {target2.rating} için ise {target2.timeline} vadeli kapsamlı iyileştirme programı gerekmektedir.
          </div>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com · {reportNo}</span>
      </div>
    </div>
  )
}
