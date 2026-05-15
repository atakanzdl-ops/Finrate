'use client'
import type { ReportData, RatioRow } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'profitabilityRatios'>
  sector?: string
}

function RatioRowComponent({ row }: { row: RatioRow }) {
  const BADGE: Record<RatioRow['status'], string> = { iyi: 'b-g', uyari: 'b-w', risk: 'b-r' }
  const STATUS_LABEL: Record<RatioRow['status'], string> = { iyi: 'İyi', uyari: 'Uyarı', risk: 'Risk' }
  return (
    <div className="rr">
      <div className="rn">{row.name}</div>
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

export default function ProfitabilityRatiosPage({ data, sector }: Props) {
  const { companyName, reportNo, profitabilityRatios } = data

  const profitRows   = profitabilityRatios.filter(r => r.group === 'Kârlılık')
  const activityRows = profitabilityRatios.filter(r => r.group === 'Faaliyet')

  return (
    <div className="pdf-page">
      <div className="wm">KÂRLILIK</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 05</div><div className="ph-title">Kârlılık &amp; Faaliyet Oranları</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 6</div></div>
      </div>
      <div className="pc">

        {/* Sektör bazlı kıyas rozeti */}
        {sector && (
          <div className="sektor-kiyas-badge">
            SEKTÖR BAZLI KIYAS: {sector.toUpperCase()}
          </div>
        )}

        <div className="rth">
          <span>Metrik</span>
          <span>Firma</span>
          <span>Sektör</span>
          <span style={{ textAlign: 'left', paddingLeft: '8px' }}>Gösterge Çubuğu</span>
          <span>Durum</span>
        </div>

        {profitRows.length > 0 && (
          <>
            <div className="rsh">Kârlılık Oranları</div>
            {profitRows.map((row, i) => <RatioRowComponent key={i} row={row} />)}
          </>
        )}

        {activityRows.length > 0 && (
          <>
            <div className="rsh" style={{ marginTop: '4px' }}>Faaliyet Oranları</div>
            {activityRows.map((row, i) => <RatioRowComponent key={i} row={row} />)}
          </>
        )}

        <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '11px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0a192f', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Kârlılık Göstergeleri Hakkında</div>
            <div style={{ fontSize: '8.5px', color: '#64748b', lineHeight: 1.6 }}>FAVÖK marjı faiz, amortisman ve vergi öncesi operasyonel kârlılığı gösterir. ROA ve ROE varlık ve özkaynak kullanım etkinliğini ölçer. Büyüme oranının ÜFE üzerinde kalması reel büyümeyi ifade eder.</div>
          </div>
          <div>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0a192f', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Faaliyet Göstergeleri Hakkında</div>
            <div style={{ fontSize: '8.5px', color: '#64748b', lineHeight: 1.6 }}>DSO, DIO, DPO ve CCC nakit dönüşüm verimliliğini ölçer. Aktif devir hızı yüksek olduğunda varlık kullanımı etkin; düşük olduğunda atıl kapasite riski söz konusu olabilir.</div>
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
