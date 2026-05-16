'use client'
import type { ReportData } from '@/types/report'
import { fmtCurrency, fmtRatio, fmtPct, fmtPctSigned, BAR_COLOR } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'rating' | 'totalScore' | 'financialScore' | 'subjectiveScore' | 'reportNo' | 'executive'>
  sector?: string
}

// Sayfa 4 ile aynı mantık — skor bazlı, kırmızı yok
const getBarColor = (score: number): string => {
  if (score >= 70) return BAR_COLOR.iyi
  if (score >= 40) return BAR_COLOR.uyari
  return BAR_COLOR.uyari
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

export default function ExecutiveSummaryPage({ data, sector }: Props) {
  const { companyName, rating, totalScore, financialScore, subjectiveScore, reportNo, executive: ex } = data
  const { categories: cat, kpis, strengths, watchAreas, conclusion, riskClassification, missingFields } = ex

  const catDefs = [
    { key: 'liquidity',     label: 'Likidite',  data: cat.liquidity },
    { key: 'profitability', label: 'Kârlılık',  data: cat.profitability },
    { key: 'leverage',      label: 'Kaldıraç',  data: cat.leverage },
    { key: 'activity',      label: 'Faaliyet',  data: cat.activity },
  ]

  return (
    <div className="pdf-page">
      <div className="wm">ÖZET</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 01</div><div className="ph-title">Yönetici Özeti</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 2</div></div>
      </div>
      <div className="pc">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>

          {/* Sol: Skor kartları + Kategori barlar */}
          <div>
            {/* 3 skor kartı */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div className="sc">
                <div className="sc-bar" style={{ background: '#0284c7' }} />
                <div className="sc-lbl">Finansal Skor</div>
                <div className="sc-val">{financialScore}<span style={{ fontSize: '16px', color: '#94a3b8', fontWeight: 400 }}>/70</span></div>
                <div className="sc-sub">70 puan üzerinden</div>
              </div>
              <div className="sc">
                <div className="sc-bar" style={{ background: '#2dd4bf' }} />
                <div className="sc-lbl">Subjektif Skor</div>
                <div className="sc-val">{subjectiveScore}<span style={{ fontSize: '16px', color: '#94a3b8', fontWeight: 400 }}>/30</span></div>
                <div className="sc-sub">30 puan üzerinden</div>
              </div>
              <div className="sc" style={{ background: '#0a192f', borderColor: '#0a192f' }}>
                <div className="sc-bar" style={{ background: '#2dd4bf' }} />
                <div className="sc-lbl" style={{ color: '#64748b' }}>Toplam Skor</div>
                <div className="sc-val" style={{ color: 'white' }}>{totalScore}<span style={{ fontSize: '16px', color: '#475569', fontWeight: 400 }}>/100</span></div>
                <div className="sc-sub" style={{ color: '#64748b' }}>Rating: {rating}</div>
              </div>
            </div>

            {/* Kategori barlar */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px 20px' }}>
              <div className="st" style={{ marginBottom: '14px' }}>Kategori Skorları <span className="st-sub">Firma Skoru vs Performans Referansı</span></div>

              {catDefs.map((c, i) => (
                <div className="cb" key={c.key} style={i === catDefs.length - 1 ? { marginBottom: 0 } : {}}>
                  <div className="cb-hd">
                    <span className="cb-lbl">{c.label} <span style={{ color: '#94a3b8', fontSize: '8.5px' }}>(Ağırlık %{Math.round(c.data.weight * 100)})</span></span>
                    <div style={{ textAlign: 'right' }}>
                      <span className="cb-sc">{Math.round(c.data.score)}</span>
                      <span className="cb-bm"> / Ref: {Math.round(c.data.referenceScore)}</span>
                    </div>
                  </div>
                  <div className="cb-trk">
                    <div className="cb-fil" style={{ width: `${c.data.score}%`, background: getBarColor(c.data.score) }} />
                    <div className="cb-mrk" style={{ left: `${c.data.referenceScore}%` }} />
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div style={{ display: 'flex', gap: '18px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '8px', color: '#64748b' }}>
                  <div style={{ width: '16px', height: '5px', background: 'linear-gradient(90deg,#0ea5e9,#2dd4bf)', borderRadius: '3px' }} />
                  Firma Skoru
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '8px', color: '#64748b' }}>
                  <div style={{ width: '3px', height: '14px', background: '#0a192f', borderRadius: '2px' }} />
                  Performans Referansı
                </div>
              </div>
            </div>
          </div>

          {/* Sağ: KPI grid + değerlendirme */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div className="kpi" style={{ borderTop: '2px solid #0284c7' }}>
                <div className="kpi-l">Net Satışlar</div>
                <div className="kpi-v" style={{ color: '#0284c7' }}>{fmtCurrency(kpis.netSales)}</div>
                <div className="kpi-s">{kpis.netSalesYoY != null ? `${fmtPctSigned(kpis.netSalesYoY)} (Yıllık)` : '—'}</div>
              </div>
              <div className="kpi" style={{ borderTop: '2px solid #2dd4bf' }}>
                <div className="kpi-l">FAVÖK</div>
                <div className="kpi-v" style={{ color: '#0f766e' }}>{fmtCurrency(kpis.ebitda)}</div>
                <div className="kpi-s">Marj: {fmtPct(kpis.ebitdaMargin)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Cari Oran</div>
                <div className="kpi-v">{fmtRatio(kpis.currentRatio)}</div>
                <div className="kpi-s">Sektör: {fmtRatio(kpis.sectorCurrentRatio)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Borç / Özkaynak</div>
                <div className="kpi-v">{fmtRatio(kpis.debtToEquity)}</div>
                <div className="kpi-s">Sektör: {fmtRatio(kpis.sectorDebtToEquity)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Faiz Karşılama</div>
                <div className="kpi-v">{fmtRatio(kpis.interestCoverage)}</div>
                <div className="kpi-s">Sektör: {fmtRatio(kpis.sectorInterestCoverage)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Özkaynak</div>
                <div className="kpi-v">{fmtCurrency(kpis.equity)}</div>
                <div className="kpi-s">{kpis.equityYoY != null ? `${fmtPctSigned(kpis.equityYoY)} (Yıllık)` : '—'}</div>
              </div>
            </div>

            {/* Genel Değerlendirme */}
            <div className="ev">
              <div className="ev-t">Genel Değerlendirme</div>
              <div className="ev-tx">{conclusion}</div>
            </div>
          </div>
        </div>

        {/* Ö8: Eksik veri uyarısı */}
        {missingFields && missingFields.length > 0 && (
          <div className="missing-warning">
            <strong>Uyarı:</strong>{' '}
            Bu raporda {missingFields.join(', ')} kalemleri eksik girilmiş olduğundan ilgili analizler sınırlı yapılmıştır.
          </div>
        )}

        {/* Alt: Güçlü & Risk + Ö9 Risk Klasmanı */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div className="str">
            <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Güçlü Alanlar</div>
            {strengths.length > 0
              ? strengths.map((s, i) => (
                  <div key={i} className="str-i">
                    <CheckIcon />
                    {s}
                  </div>
                ))
              : <div className="str-i"><CheckIcon />Sektör ortalamasına yakın finansal profil.</div>}
          </div>
          <div>
            <div className="rsk">
              <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>İzleme Alanları</div>
              {watchAreas.length > 0
                ? watchAreas.map((w, i) => (
                    <div key={i} className="rsk-i">
                      <WarnIcon />
                      {w}
                    </div>
                  ))
                : <div className="rsk-i"><WarnIcon />Senaryo analizine göre iyileştirme fırsatları mevcuttur.</div>}
            </div>

            {/* Ö9: Finrate Risk Klasmanı */}
            {riskClassification && (
              <div className="risk-classification">
                <div className="rc-header">Finrate Risk Klasmanı</div>
                <div className="rc-body">
                  <div className="rc-circle" style={{ background: riskClassification.overallColor }}>
                    <div className="rc-level">{riskClassification.overallLevel}</div>
                    <div className="rc-sublabel">Risk</div>
                  </div>
                  <div className="rc-metrics">
                    {riskClassification.metrics.map((m, i) => (
                      <div key={i} className="rc-metric">
                        <span className="rc-label">{m.label}</span>
                        <span className="rc-status" style={{ color: m.color }}>{m.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
