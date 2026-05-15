'use client'
import type { ReportData, BalanceSheetItem } from '@/types/report'
import { fmtCurrency, fmtPct } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'balanceSheet'>
  sector?: string
}

function BsRow({ item, colCount }: { item: BalanceSheetItem; colCount: number }) {
  const isTotal = item.isTotal
  const isMain  = item.isMain
  const trClass = isMain ? 'mr' : isTotal ? 'tr' : ''

  return (
    <tr className={trClass}>
      <td>{item.label}</td>
      {item.values.slice(0, colCount).map((v, i) => (
        <td key={i}>{v != null ? fmtCurrency(v) : '—'}</td>
      ))}
    </tr>
  )
}

export default function BalanceSheetPage({ data, sector }: Props) {
  const { companyName, reportNo, balanceSheet: bs } = data
  const { years, items, totalAssets, totalLiabilities, equityRatio, comment } = bs

  return (
    <div className="pdf-page">
      <div className="wm">BİLANÇO</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 07</div><div className="ph-title">Aktif/Pasif Analizi</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 8</div></div>
      </div>
      <div className="pc">

        {/* Özet Kartlar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div className="kpi" style={{ borderTop: '2px solid #0284c7' }}>
            <div className="kpi-l">Toplam Aktif</div>
            <div className="kpi-v">{fmtCurrency(totalAssets)}</div>
            <div className="kpi-s">Son dönem</div>
          </div>
          <div className="kpi" style={{ borderTop: '2px solid #ef4444' }}>
            <div className="kpi-l">Toplam Yükümlülük</div>
            <div className="kpi-v" style={{ color: '#dc2626' }}>{fmtCurrency(totalLiabilities)}</div>
            <div className="kpi-s">Borç yapısı</div>
          </div>
          <div className="kpi" style={{ borderTop: '2px solid #22c55e' }}>
            <div className="kpi-l">Özkaynak Oranı</div>
            <div className="kpi-v" style={{ color: '#16a34a' }}>{fmtPct(equityRatio)}</div>
            <div className="kpi-s">Özkaynak / Aktif</div>
          </div>
        </div>

        {/* Bilanço Tablosu */}
        <table className="pt">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Bilanço Kalemi</th>
              {years.map(y => <th key={y.year}>{y.year}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <BsRow key={i} item={item} colCount={years.length} />
            ))}
          </tbody>
        </table>

        {/* Yorum */}
        <div style={{ marginTop: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0369a1', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Bilanço Değerlendirmesi</div>
          <div style={{ fontSize: '8.5px', color: '#475569', lineHeight: 1.6 }}>{comment}</div>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
