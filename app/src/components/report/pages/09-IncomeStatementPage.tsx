'use client'
import type { ReportData, IncomeStatementItem } from '@/types/report'
import { fmtCurrency, fmtPct } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'incomeStatement'>
  sector?: string
}

function ISRow({ item, colCount, lastYear }: { item: IncomeStatementItem; colCount: number; lastYear: number }) {
  const isTotal = item.isTotal
  const isMain  = item.isMain
  const trClass = isMain ? 'mr' : isTotal ? 'tr' : ''
  const showMargin = item.margin2024 != null && isTotal

  return (
    <tr className={trClass}>
      <td>{item.label}</td>
      {item.values.slice(0, colCount).map((v, i) => (
        <td key={i}>{v != null ? fmtCurrency(v) : '—'}</td>
      ))}
      <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px' }}>
        {showMargin ? (
          <span style={{ background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 700 }}>
            {fmtPct(item.margin2024)}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}

export default function IncomeStatementPage({ data, sector }: Props) {
  const { companyName, reportNo, incomeStatement: is_ } = data
  const { years, items } = is_
  const lastYear = years[years.length - 1]?.year ?? 0

  return (
    <div className="pdf-page">
      <div className="wm">GELİR</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 08</div><div className="ph-title">Gelir Tablosu Analizi</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 9</div></div>
      </div>
      <div className="pc">

        <div style={{ marginBottom: '14px' }}>
          <div className="st">Gelir Tablosu <span className="st-sub">Çok Dönemli Karşılaştırma · {years.map(y => y.year).join(', ')}</span></div>
        </div>

        <table className="pt">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Kalem</th>
              {years.map(y => <th key={y.year}>{y.year}</th>)}
              <th>Marj ({lastYear})</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <ISRow key={i} item={item} colCount={years.length} lastYear={lastYear} />
            ))}
          </tbody>
        </table>

        {/* Notlar */}
        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0a192f', marginBottom: '5px' }}>Tablo Notları</div>
            <div style={{ fontSize: '8px', color: '#64748b', lineHeight: 1.6 }}>
              Negatif değerler maliyet/gider kalemlerini gösterir. Marj sütunu son dönem net satışlara oranı ifade eder. FAVÖK = FVÖK + Amortisman ve İtfa Payları.
            </div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#166534', marginBottom: '5px' }}>Önemli Kalemler</div>
            <div style={{ fontSize: '8px', color: '#166534', lineHeight: 1.6 }}>
              Brüt kâr, FAVÖK ve Net Kâr marjları sektör kıyaslaması için kritik göstergelerdir. Ayrıntılı skor analizi Sayfa 4&apos;te yer almaktadır.
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
