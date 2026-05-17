'use client'
import type { ReportData } from '@/types/report'
import { fmtCurrency } from '../formatters'
import { shortPeriodLabel } from '@/lib/periods'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'cashFlow'>
  sector?: string
}

// PDF'te font glyph sorununu önlemek için inline SVG — sayfa 02/04 ile birebir aynı
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

export default function CashFlowPage({ data, sector }: Props) {
  const { companyName, reportNo, cashFlow: cf } = data
  const { ccc, workingCapitalTable, positives, improvements, conclusion } = cf

  const hasCompact = workingCapitalTable.length > 0 && workingCapitalTable[0].years.length > 0
  const wcYears = workingCapitalTable[0]?.years ?? []

  // CCC daire boyutu hesabı (görsel)
  const maxGunler = Math.max(ccc.dso, ccc.dio, ccc.dpo, 90)

  function CccBar({ label, value, sectorValue, color }: { label: string; value: number; sectorValue: number | null; color: string }) {
    const fill = Math.min(100, (value / maxGunler) * 100)
    const secFill = sectorValue != null ? Math.min(100, (sectorValue / maxGunler) * 100) : null
    return (
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, color: '#334155' }}>{label}</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span className="mono" style={{ fontSize: '10px', fontWeight: 800, color: '#0a192f' }}>{value} gün</span>
            {sectorValue != null && <span style={{ fontSize: '8.5px', color: '#94a3b8' }}>Sektör: {sectorValue} gün</span>}
          </div>
        </div>
        <div className="prt">
          <div className="prf" style={{ width: `${fill}%`, background: color }} />
          {secFill != null && <div className="prm" style={{ left: `${secFill}%` }} />}
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-page">
      <div className="wm">NAKİT</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 09</div><div className="ph-title">Nakit Akış &amp; Çalışma Sermayesi</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 10</div></div>
      </div>
      <div className="pc">

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>

          {/* Sol: CCC Bileşenleri */}
          <div>
            <div className="st" style={{ marginBottom: '12px' }}>
              Nakit Dönüşüm Çevrimi (CCC) <span className="st-sub">DSO + DIO − DPO</span>
            </div>

            {/* CCC Özeti */}
            <div style={{ background: '#0a192f', borderRadius: '12px', padding: '14px 18px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Toplam CCC</div>
                <div className="outfit" style={{ fontSize: '32px', fontWeight: 900, color: '#2dd4bf', lineHeight: 1 }}>{ccc.ccc}</div>
                <div style={{ fontSize: '8.5px', color: '#94a3b8', marginTop: '4px' }}>gün</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '8.5px', color: '#94a3b8', lineHeight: 1.8 }}>
                <div>DSO: <span className="mono" style={{ color: '#2dd4bf', fontWeight: 700 }}>{ccc.dso}</span> gün</div>
                <div>DIO: <span className="mono" style={{ color: '#2dd4bf', fontWeight: 700 }}>{ccc.dio}</span> gün</div>
                <div>DPO: <span className="mono" style={{ color: '#f59e0b', fontWeight: 700 }}>{ccc.dpo}</span> gün</div>
                {ccc.sectorCcc != null && <div style={{ marginTop: '6px' }}>Sektör: <span className="mono" style={{ color: '#64748b', fontWeight: 700 }}>{ccc.sectorCcc}</span> gün</div>}
              </div>
            </div>

            {/* Barlar */}
            <CccBar label="Alacak Tahsil Süresi (DSO)" value={ccc.dso} sectorValue={ccc.sectorDso} color="linear-gradient(90deg,#0ea5e9,#2dd4bf)" />
            <CccBar label="Stok Devir Süresi (DIO)" value={ccc.dio} sectorValue={ccc.sectorDio} color="linear-gradient(90deg,#8b5cf6,#6366f1)" />
            <CccBar label="Ticari Borç Ödeme Süresi (DPO)" value={ccc.dpo} sectorValue={ccc.sectorDpo} color="linear-gradient(90deg,#f59e0b,#fb923c)" />

            <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '6px' }}>{ccc.comment}</div>
          </div>

          {/* Sağ: Çalışma Sermayesi Tablosu */}
          <div>
            <div className="st" style={{ marginBottom: '12px' }}>Çalışma Sermayesi Değişimi</div>
            {hasCompact && (
              <table className="pt" style={{ marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Kalem</th>
                    {wcYears.map(({ year, period, isCurrent }) => {
                      const periodLbl = shortPeriodLabel(period)
                      return (
                        <th
                          key={`${year}-${period}`}
                          style={isCurrent ? { background: 'var(--fr-primary)', color: '#fff', fontWeight: 700 } : undefined}
                        >
                          {year}
                          {periodLbl && (
                            <div style={{ fontSize: '6.5px', fontWeight: 400, color: isCurrent ? '#bfdbfe' : '#0284c7', letterSpacing: 0 }}>
                              {periodLbl}
                            </div>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {workingCapitalTable.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '9.5px', fontWeight: 500 }}>{row.label}</td>
                      {row.values.map((v, j) => (
                        <td key={j}>{v != null ? fmtCurrency(v) : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Olumlu / İyileştirme */}
            <div className="str" style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '8.5px', fontWeight: 800, color: '#166534', marginBottom: '6px' }}>Olumlu Göstergeler</div>
              {positives.map((p, i) => (
                <div key={i} className="str-i" style={{ fontSize: '8px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                  <CheckIcon />
                  <span>{p}</span>
                </div>
              ))}
            </div>
            <div className="rsk">
              <div style={{ fontSize: '8.5px', fontWeight: 800, color: '#991b1b', marginBottom: '6px' }}>İyileştirme Alanları</div>
              {improvements.map((m, i) => (
                <div key={i} className="rsk-i" style={{ fontSize: '8px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                  <WarnIcon />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Değerlendirme */}
        <div className="ev">
          <div className="ev-t">Nakit Akış Değerlendirmesi</div>
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
