'use client'
import type { ReportData } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'vkn' | 'analysisPeriod' | 'reportNo' | 'validUntil' | 'reportDate' | 'companyInfo'> & {
    revenue?: string   // fmtCurrency(financialData.revenue) — page düzeyinde hesaplanır
    scaleLabel?: string
  }
  sector?: string
}

export default function CompanyInfoPage({ data, sector }: Props) {
  const { companyName, vkn, analysisPeriod, reportNo, validUntil, reportDate, companyInfo: ci } = data
  const { sectorBenchmarks, sectorWeightProfile: wp } = ci

  return (
    <div className="pdf-page">
      <div className="wm">FİRMA</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 02</div><div className="ph-title">Firma &amp; Sektör Bilgisi</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 3</div></div>
      </div>
      <div className="pc">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* Sol: Firma Bilgileri */}
          <div>
            <div className="st" style={{ marginBottom: '10px' }}>Firma Genel Bilgileri</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '11px', overflow: 'hidden' }}>
              <table className="it">
                <tbody>
                  <tr><td>Firma Ünvanı</td><td>{companyName}</td></tr>
                  <tr><td>VKN</td><td>{vkn}</td></tr>
                  <tr><td>Sektör</td><td>{ci.sector}</td></tr>
                  <tr><td>NACE Kodu</td><td>{ci.naceCode}</td></tr>
                  <tr><td>Şirket Türü</td><td>{ci.entityType}</td></tr>
                  <tr><td>Kuruluş Yılı</td><td>{ci.foundedYear ?? '—'}</td></tr>
                  <tr><td>Faaliyet Süresi</td><td>{ci.activityYears != null ? `${ci.activityYears} Yıl` : '—'}</td></tr>
                  <tr><td>Analiz Dönemi</td><td>{analysisPeriod}</td></tr>
                  <tr><td>Rapor Numarası</td><td>{reportNo}</td></tr>
                  <tr><td>Rapor Geçerliliği</td><td>{validUntil}</td></tr>
                  <tr><td>Analizi Yapan</td><td>Finrate Sistem Otomasyonu</td></tr>
                </tbody>
              </table>
            </div>

            {/* Ölçek değerlendirmesi */}
            <div style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: '11px', padding: '16px', marginTop: '14px' }}>
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Firma Ölçeği Değerlendirmesi</div>
              <div className="outfit" style={{ fontSize: '18px', fontWeight: 800, color: '#0a192f' }}>{data.scaleLabel ?? ci.scale ?? '—'}</div>
              <div style={{ fontSize: '9px', color: '#0369a1', marginTop: '5px' }}>
                {data.revenue ? `Net Satış: ${data.revenue} · ` : ''}
                {ci.activityYears != null ? `${ci.activityYears} Yıl Faaliyet` : 'Kuruluş bilgisi girilmemiş'}
              </div>
            </div>
          </div>

          {/* Sağ: Sektör Risk Profili */}
          <div>
            <div className="st" style={{ marginBottom: '10px' }}>
              Sektör Benchmark Profili <span className="st-sub">{ci.sector} — TCMB 2024</span>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '11px', overflow: 'hidden', marginBottom: '14px' }}>
              <table className="stb">
                <thead>
                  <tr><th>Metrik</th><th>TCMB 2024 Sektör Ort.</th></tr>
                </thead>
                <tbody>
                  {sectorBenchmarks.map((row, i) => (
                    <tr key={i}>
                      <td>{row.label}</td>
                      <td>{row.sectorValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sektörel ağırlık profili */}
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '11px', padding: '15px' }}>
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#166534', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {ci.sector} Sektörü Ağırlık Profili
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div style={{ fontSize: '9px', color: '#334155' }}>
                  <span className="mono" style={{ fontWeight: 700, color: '#0a192f' }}>%{Math.round(wp.liquidity * 100)}</span> — Likidite
                </div>
                <div style={{ fontSize: '9px', color: '#334155' }}>
                  <span className="mono" style={{ fontWeight: 700, color: '#0a192f' }}>%{Math.round(wp.profitability * 100)}</span> — Kârlılık
                </div>
                <div style={{ fontSize: '9px', color: '#334155' }}>
                  <span className="mono" style={{ fontWeight: 700, color: '#0a192f' }}>%{Math.round(wp.leverage * 100)}</span> — Kaldıraç
                </div>
                <div style={{ fontSize: '9px', color: '#334155' }}>
                  <span className="mono" style={{ fontWeight: 700, color: '#0a192f' }}>%{Math.round(wp.activity * 100)}</span> — Faaliyet
                </div>
              </div>
            </div>
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
