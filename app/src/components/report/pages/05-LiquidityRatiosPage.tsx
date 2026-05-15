'use client'
import type { ReportData, RatioRow } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'liquidityRatios'>
  sector?: string
}

function RatioRowComponent({ row }: { row: RatioRow }) {
  const BADGE: Record<RatioRow['status'], string> = { iyi: 'b-g', uyari: 'b-w', risk: 'b-r' }
  const STATUS_LABEL: Record<RatioRow['status'], string> = { iyi: 'İyi', uyari: 'Uyarı', risk: 'Risk' }

  return (
    <div className="rr">
      <div className="rn">{row.name}{row.description && <div style={{ fontSize: '7.5px', color: '#94a3b8', marginTop: '2px' }}>{row.description}</div>}</div>
      <div className="rv">{row.companyValue}</div>
      <div className="rbm">{row.sectorValue}</div>
      <div className="rbar">
        <div className="prt">
          <div className="prf" style={{ width: `${row.barFill}%`, background: row.barColor }} />
          {row.sectorMark != null && <div className="prm" style={{ left: `${row.sectorMark}%` }} />}
        </div>
      </div>
      <div className="rst">
        <span className={`b ${BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
      </div>
    </div>
  )
}

export default function LiquidityRatiosPage({ data, sector }: Props) {
  const { companyName, reportNo, liquidityRatios } = data

  const liquidityRows = liquidityRatios.filter(r => r.group === 'Likidite')
  const leverageRows  = liquidityRatios.filter(r => r.group === 'Borçlanma')

  return (
    <div className="pdf-page">
      <div className="wm">LİKİDİTE</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 04</div><div className="ph-title">Likidite &amp; Borçlanma Oranları</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 5</div></div>
      </div>
      <div className="pc">

        {/* Sektör bazlı kıyas rozeti */}
        {sector && (
          <div className="sektor-kiyas-badge">
            SEKTÖR BAZLI KIYAS: {sector.toUpperCase()}
          </div>
        )}

        {/* Tablo başlığı */}
        <div className="rth">
          <span>Metrik</span>
          <span>Firma</span>
          <span>Sektör</span>
          <span style={{ textAlign: 'left', paddingLeft: '8px' }}>Gösterge Çubuğu</span>
          <span>Durum</span>
        </div>

        {/* Likidite Grubu */}
        {liquidityRows.length > 0 && (
          <>
            <div className="rsh">Likidite Oranları</div>
            {liquidityRows.map((row, i) => <RatioRowComponent key={i} row={row} />)}
          </>
        )}

        {/* Borçlanma Grubu */}
        {leverageRows.length > 0 && (
          <>
            <div className="rsh" style={{ marginTop: '4px' }}>Borçlanma Oranları</div>
            {leverageRows.map((row, i) => <RatioRowComponent key={i} row={row} />)}
          </>
        )}

        {/* Açıklama kutusu */}
        <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '11px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0a192f', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Likidite Göstergeleri Hakkında</div>
            <div style={{ fontSize: '8.5px', color: '#64748b', lineHeight: 1.6 }}>Cari oran, kısa vadeli yükümlülükleri karşılama kapasitesini gösterir. 1.5x üzeri genel kabul görmüş eşik olmakla birlikte sektöre göre değişir. NÇS / Aktif sektöre kıyasla değerlendirilmelidir.</div>
          </div>
          <div>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0a192f', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Borçlanma Göstergeleri Hakkında</div>
            <div style={{ fontSize: '8.5px', color: '#64748b', lineHeight: 1.6 }}>Faiz karşılama oranı, borç servis kapasitesinin temel göstergesidir. 3x ve üzeri bankacılık sektöründe yeterli olarak değerlendirilir. Sektör kıyaslaması kritik öneme sahiptir.</div>
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
