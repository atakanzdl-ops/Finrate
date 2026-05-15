'use client'
import type { ReportData } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'subjectiveScore' | 'reportNo' | 'financialDetail'>
  sector?: string
}

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
                      <span style={{ fontSize: '8.5px', color: '#94a3b8', marginLeft: '8px' }}>Sektör: {Math.round(cb.sectorScore)}</span>
                    </div>
                  </div>
                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${cb.score}%`, background: cb.fillColor, borderRadius: '999px', transition: 'width .3s' }} />
                    <div style={{ position: 'absolute', top: '-3px', left: `${cb.sectorScore}%`, width: '2px', height: '16px', background: '#0a192f', borderRadius: '2px', zIndex: 10 }} />
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
                      <span style={{ fontSize: '8.5px', color: '#94a3b8', marginLeft: '8px' }}>Sektör: {Math.round(cb.sectorScore)}</span>
                    </div>
                  </div>
                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${cb.score}%`, background: cb.fillColor, borderRadius: '999px', transition: 'width .3s' }} />
                    <div style={{ position: 'absolute', top: '-3px', left: `${cb.sectorScore}%`, width: '2px', height: '16px', background: '#0a192f', borderRadius: '2px', zIndex: 10 }} />
                  </div>
                  <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>{cb.subMetrics}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alt: Güçlü & İzleme + Değerlendirme */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div className="str">
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Güçlü Alanlar</div>
            {strengths.slice(0, 4).map((s, i) => <div key={i} className="str-i">{s}</div>)}
          </div>
          <div className="rsk">
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>İzleme Alanları</div>
            {watchAreas.slice(0, 4).map((w, i) => <div key={i} className="rsk-i">{w}</div>)}
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
        <span>finrate.com · {reportNo}</span>
      </div>
    </div>
  )
}
