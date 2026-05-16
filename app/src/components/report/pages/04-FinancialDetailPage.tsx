'use client'
import type { ReportData } from '@/types/report'
import { BAR_COLOR } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'subjectiveScore' | 'reportNo' | 'financialDetail'>
  sector?: string
}

// T13: BAR_COLOR gradient sistemiyle uyumlu — kırmızı yok
const getBarColor = (score: number): string => {
  if (score >= 70) return BAR_COLOR.iyi
  if (score >= 40) return BAR_COLOR.uyari
  return BAR_COLOR.uyari  // düşük skor da amber-sarı (kırmızı yok)
}

// PDF'te font glyph sorununu önlemek için inline SVG
const CheckIcon = () => (
  <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', color: '#16a34a', marginRight: 4, flexShrink: 0 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  </span>
)

const WarnIcon = () => (
  <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', color: '#f97316', marginRight: 4, flexShrink: 0 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  </span>
)

export default function FinancialDetailPage({ data, sector }: Props) {
  const { companyName, subjectiveScore, reportNo, financialDetail: fd } = data
  const { kpis, categoryBars, strengths, watchAreas, conclusion } = fd

  return (
    <div className="pdf-page">
      <div className="wm">FİNANSAL</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 03</div><div className="ph-title">Finansal Skor Detayı</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 4</div></div>
      </div>
      <div className="pc">

        {/* Üst: KPI satırı */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis.length + 1, 6)}, 1fr)`, gap: '9px', marginBottom: '16px' }}>
          {kpis.map((k, i) => (
            <div key={i} className="kpi">
              <div className="kpi-l">{k.label}</div>
              <div className="kpi-v" style={{ fontSize: '16px', color: k.color }}>{k.value}</div>
              <div className="kpi-s">{k.sub}</div>
            </div>
          ))}
          {/* Subjektif KPI */}
          <div className="kpi">
            <div className="kpi-l">Subjektif</div>
            <div className="kpi-v" style={{ fontSize: '16px' }}>{subjectiveScore}/30</div>
            <div className="kpi-s">Kritik faktörler</div>
          </div>
        </div>

        {/* Detaylı Kategori Barlar */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', marginBottom: '14px' }}>
          <div className="st" style={{ marginBottom: '14px' }}>Kategori Analizi <span className="st-sub">Firma skoru ve sektör kıyaslaması</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

            <div>
              {categoryBars.slice(0, 2).map((cb, i) => (
                <div key={i} style={{ marginBottom: i === 0 ? '16px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0a192f' }}>{cb.name}</div>
                    <div>
                      <span className="mono" style={{ fontSize: '15px', fontWeight: 800, color: '#0a192f' }}>{Math.round(cb.score)}</span>
                      <span style={{ fontSize: '8.5px', color: '#94a3b8' }}> / 100</span>
                      <span style={{ fontSize: '8.5px', color: '#94a3b8', marginLeft: '8px' }}>Ref: {Math.round(cb.referenceScore)}</span>
                    </div>
                  </div>
                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${cb.score}%`, background: getBarColor(cb.score), borderRadius: '999px', transition: 'width .3s' }} />
                    <div style={{ position: 'absolute', top: '-3px', left: `${cb.referenceScore}%`, width: '2px', height: '16px', background: '#0a192f', borderRadius: '2px', zIndex: 10 }} />
                  </div>
                  <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>{cb.subMetrics}</div>
                </div>
              ))}
            </div>

            <div>
              {categoryBars.slice(2, 4).map((cb, i) => (
                <div key={i} style={{ marginBottom: i === 0 ? '16px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0a192f' }}>{cb.name}</div>
                    <div>
                      <span className="mono" style={{ fontSize: '15px', fontWeight: 800, color: '#0a192f' }}>{Math.round(cb.score)}</span>
                      <span style={{ fontSize: '8.5px', color: '#94a3b8' }}> / 100</span>
                      <span style={{ fontSize: '8.5px', color: '#94a3b8', marginLeft: '8px' }}>Ref: {Math.round(cb.referenceScore)}</span>
                    </div>
                  </div>
                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${cb.score}%`, background: getBarColor(cb.score), borderRadius: '999px', transition: 'width .3s' }} />
                    <div style={{ position: 'absolute', top: '-3px', left: `${cb.referenceScore}%`, width: '2px', height: '16px', background: '#0a192f', borderRadius: '2px', zIndex: 10 }} />
                  </div>
                  <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>{cb.subMetrics}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '18px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '8px', color: '#64748b' }}>
              <div style={{ width: '16px', height: '5px', background: BAR_COLOR.iyi, borderRadius: '3px' }} />
              Firma Skoru
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '8px', color: '#64748b' }}>
              <div style={{ width: '3px', height: '14px', background: '#0a192f', borderRadius: '2px' }} />
              Performans Referansı
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '8px', color: '#64748b' }}>
              <div style={{ width: '16px', height: '5px', background: BAR_COLOR.uyari, borderRadius: '3px' }} />
              Dikkat gerektiren
            </div>
          </div>
        </div>

        {/* Alt: Güçlü & İzleme + Değerlendirme */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div className="str">
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Güçlü Alanlar</div>
            {strengths.slice(0, 4).map((s, i) => (
              <div key={i} className="str-i">
                <CheckIcon />
                {s}
              </div>
            ))}
          </div>
          <div className="rsk">
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>İzleme Alanları</div>
            {watchAreas.slice(0, 4).map((w, i) => (
              <div key={i} className="rsk-i">
                <WarnIcon />
                {w}
              </div>
            ))}
          </div>
        </div>

        {/* Değerlendirme kutusu */}
        <div className="ev">
          <div className="ev-t">Finansal Skor Değerlendirmesi</div>
          <div className="ev-tx">{conclusion}</div>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
