'use client'

import { useState } from 'react'
import clsx from 'clsx'

// ─── Types ─────────────────────────────────────────────────
type RowType = 'header' | 'account' | 'subtotal' | 'total'

interface RowDef {
  type: RowType
  code?: string
  label: string
  field?: string
}

interface FinData {
  id: string
  year: number
  period: string
  [key: string]: number | null | string
}

interface Props {
  entityId: string
  data: FinData[]
  onRefresh: () => void
}

// ─── TDHP Satır Tanımları ──────────────────────────────────
const TDHP_ROWS: RowDef[] = [
  // BİLANÇO — AKTİF
  { type: 'header',  label: 'I. DÖNEN VARLIKLAR' },
  { type: 'account', code: '10', label: '10. Hazır Değerler',                                    field: 'cash' },
  { type: 'account', code: '11', label: '11. Menkul Kıymetler',                                  field: 'shortTermInvestments' },
  { type: 'account', code: '12', label: '12. Ticari Alacaklar',                                  field: 'tradeReceivables' },
  { type: 'account', code: '13', label: '13. Diğer Alacaklar' },
  { type: 'account', code: '15', label: '15. Stoklar',                                           field: 'inventory' },
  { type: 'account', code: '17', label: '17. Yıllara Yaygın İnş. ve Onarım Maliyetleri' },
  { type: 'account', code: '18', label: '18. Gelecek Aylara Ait Giderler' },
  { type: 'account', code: '19', label: '19. Diğer Dönen Varlıklar',                            field: 'otherCurrentAssets' },
  { type: 'subtotal',            label: '▶ DÖNEN VARLIK TOPLAMI',                               field: 'totalCurrentAssets' },

  { type: 'header',  label: 'II. DURAN VARLIKLAR' },
  { type: 'account', code: '22', label: '22. Ticari Alacaklar' },
  { type: 'account', code: '23', label: '23. Diğer Alacaklar' },
  { type: 'account', code: '24', label: '24. Mali Duran Varlıklar',                              field: 'longTermInvestments' },
  { type: 'account', code: '25', label: '25. Maddi Duran Varlıklar',                             field: 'tangibleAssets' },
  { type: 'account', code: '26', label: '26. Maddi Olmayan Duran Varlıklar',                     field: 'intangibleAssets' },
  { type: 'account', code: '27', label: '27. Özel Tükenmeye Tabi Varlıklar' },
  { type: 'account', code: '28', label: '28. Gelecek Yıllara Ait Giderler' },
  { type: 'account', code: '29', label: '29. Diğer Duran Varlıklar',                            field: 'otherNonCurrentAssets' },
  { type: 'subtotal',            label: '▶ DURAN VARLIK TOPLAMI',                               field: 'totalNonCurrentAssets' },
  { type: 'total',               label: '▶▶ AKTİF TOPLAM',                                      field: 'totalAssets' },

  // BİLANÇO — PASİF
  { type: 'header',  label: 'III. KISA VADELİ YABANCI KAYNAKLAR' },
  { type: 'account', code: '30', label: '30. Mali Borçlar',                                      field: 'shortTermFinancialDebt' },
  { type: 'account', code: '32', label: '32. Ticari Borçlar',                                    field: 'tradePayables' },
  { type: 'account', code: '33', label: '33. Diğer Borçlar' },
  { type: 'account', code: '34', label: '34. Alınan Avanslar' },
  { type: 'account', code: '35', label: '35. Yıllara Yaygın İnş. Hakedişleri' },
  { type: 'account', code: '36', label: '36. Ödenecek Vergi ve Yükümlülükler' },
  { type: 'account', code: '37', label: '37. Borç ve Gider Karşılıkları' },
  { type: 'account', code: '38', label: '38. Gelecek Aylara Ait Gelirler' },
  { type: 'account', code: '39', label: '39. Diğer KV Yabancı Kaynaklar',                       field: 'otherCurrentLiabilities' },
  { type: 'subtotal',            label: '▶ KV YABANCI KAYNAK TOPLAMI',                          field: 'totalCurrentLiabilities' },

  { type: 'header',  label: 'IV. UZUN VADELİ YABANCI KAYNAKLAR' },
  { type: 'account', code: '40', label: '40. Mali Borçlar',                                      field: 'longTermFinancialDebt' },
  { type: 'account', code: '42', label: '42. Ticari Borçlar' },
  { type: 'account', code: '43', label: '43. Diğer Borçlar' },
  { type: 'account', code: '44', label: '44. Alınan Avanslar' },
  { type: 'account', code: '47', label: '47. Borç ve Gider Karşılıkları' },
  { type: 'account', code: '49', label: '49. Diğer UV Yabancı Kaynaklar',                       field: 'otherNonCurrentLiabilities' },
  { type: 'subtotal',            label: '▶ UV YABANCI KAYNAK TOPLAMI',                          field: 'totalNonCurrentLiabilities' },

  { type: 'header',  label: 'V. ÖZ KAYNAKLAR' },
  { type: 'account', code: '50', label: '50. Ödenmiş Sermaye',                                  field: 'paidInCapital' },
  { type: 'account', code: '52', label: '52. Sermaye Yedekleri' },
  { type: 'account', code: '54', label: '54. Kar Yedekleri' },
  { type: 'account', code: '57', label: '57. Geçmiş Yıllar Karları',                            field: 'retainedEarnings' },
  { type: 'account', code: '58', label: '58. Geçmiş Yıllar Zararları (-)' },
  { type: 'account', code: '59', label: '59. Dönem Net Karı (Zararı)',                          field: 'netProfit' },
  { type: 'subtotal',            label: '▶ ÖZ KAYNAK TOPLAMI',                                  field: 'totalEquity' },
  { type: 'total',               label: '▶▶ PASİF TOPLAM',                                      field: 'totalLiabilitiesAndEquity' },

  // GELİR TABLOSU
  { type: 'header',  label: 'GELİR TABLOSU' },
  { type: 'account', code: '60', label: '60. Brüt Satışlar' },
  { type: 'account', code: '61', label: '61. Satış İndirimleri (-)' },
  { type: 'subtotal',            label: '▶ NET SATIŞLAR',                                        field: 'revenue' },
  { type: 'account', code: '62', label: '62. Satışların Maliyeti (-)',                           field: 'cogs' },
  { type: 'subtotal',            label: '▶ BRÜT SATIŞ KARI / ZARARI',                           field: 'grossProfit' },
  { type: 'account', code: '63', label: '63. Faaliyet Giderleri (-)',                            field: 'operatingExpenses' },
  { type: 'subtotal',            label: '▶ FAALİYET KARI / ZARARI',                              field: 'ebit' },
  { type: 'account', code: '64', label: '64. Diğer Olağan Gelir ve Karlar',                     field: 'otherIncome' },
  { type: 'account', code: '65', label: '65. Diğer Olağan Gider ve Zararlar (-)',               field: 'otherExpense' },
  { type: 'account', code: '66', label: '66. Finansman Giderleri (-)',                           field: 'interestExpense' },
  { type: 'subtotal',            label: '▶ OLAĞAN KAR / ZARAR',                                  field: 'ebt' },
  { type: 'account', code: '67', label: '67. Olağandışı Gelir ve Karlar' },
  { type: 'account', code: '68', label: '68. Olağandışı Gider ve Zararlar (-)' },
  { type: 'subtotal',            label: '▶ DÖNEM KARI / ZARARI',                                 field: 'ebt' },
  { type: 'account', code: '69', label: '69. Dönem Karı Vergi Karşılıkları (-)',                 field: 'taxExpense' },
  { type: 'total',               label: '▶▶ DÖNEM NET KARI / ZARARI',                            field: 'netProfit' },
]

// ─── Sabitler ──────────────────────────────────────────────
const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Kesin Beyan', Q1: '1. Geçici', Q2: '2. Geçici', Q3: '3. Geçici', Q4: '4. Geçici',
}
const LABEL_W  = 200   // px — sticky label sütun genişliği
const CODE_W   = 36    // px — sticky kod sütun genişliği

// ─── Yardımcı Fonksiyonlar ─────────────────────────────────
function fmtTR(v: number | null | undefined): string {
  if (v == null) return '0,00'
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

function parseTR(s: string): number | null {
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.')
  if (!cleaned || cleaned === '0' || cleaned === '0.00') return null
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function calcPct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null
  return ((to - from) / Math.abs(from)) * 100
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return (v >= 0 ? '+' : '') + Math.round(v) + '%'
}

// ─── Ana Component ─────────────────────────────────────────
export function TdhpSpreadsheet({ entityId, data, onRefresh }: Props) {
  const cols = [...data].sort((a, b) => a.year - b.year || a.period.localeCompare(b.period))

  const [inputStrings, setInputStrings] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving]             = useState<Record<string, boolean>>({})

  function getStoredVal(fdId: string, field: string): number | null {
    const fd = cols.find(c => c.id === fdId)
    if (!fd) return null
    const v = fd[field]
    return typeof v === 'number' ? v : null
  }

  function getDisplayStr(fdId: string, field: string): string {
    const localStr = inputStrings[fdId]?.[field]
    if (localStr !== undefined) return localStr
    const v = getStoredVal(fdId, field)
    return v != null ? fmtTR(v) : ''
  }

  function handleFocus(fdId: string, field: string, e: React.FocusEvent<HTMLInputElement>) {
    const v = getStoredVal(fdId, field)
    const raw = v != null ? String(v) : ''
    setInputStrings(prev => ({ ...prev, [fdId]: { ...(prev[fdId] ?? {}), [field]: raw } }))
    e.target.value = raw
    e.target.select()
  }

  function handleChange(fdId: string, field: string, value: string) {
    setInputStrings(prev => ({ ...prev, [fdId]: { ...(prev[fdId] ?? {}), [field]: value } }))
  }

  async function handleBlur(fdId: string, field: string) {
    const rawStr = inputStrings[fdId]?.[field] ?? ''
    const parsed = parseTR(rawStr)
    setInputStrings(prev => ({
      ...prev,
      [fdId]: { ...(prev[fdId] ?? {}), [field]: parsed != null ? fmtTR(parsed) : '' },
    }))
    setSaving(prev => ({ ...prev, [fdId]: true }))
    try {
      await fetch(`/api/entities/${entityId}/financial-data/${fdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parsed }),
      })
      onRefresh()
    } finally {
      setSaving(prev => ({ ...prev, [fdId]: false }))
    }
  }

  // ── Trend hesaplama (belirli bir field için) ────────────
  function trendCells(field: string) {
    const vals = cols.map(col => getStoredVal(col.id, field))
    const son2   = cols.length >= 2 ? calcPct(vals[cols.length - 2], vals[cols.length - 1]) : null
    const ilkSon = cols.length >= 2 ? calcPct(vals[0], vals[cols.length - 1])               : null
    return { son2, ilkSon }
  }

  function TrendCell({ v }: { v: number | null }) {
    if (v == null) return <td className="px-2 py-1 text-center text-white/20 text-[10px]">—</td>
    const pos = v >= 0
    return (
      <td className={clsx(
        'px-2 py-1 text-center text-[10px] font-bold tabular-nums',
        pos ? 'text-emerald-400' : 'text-red-400',
      )}>
        {fmtPct(v)}
      </td>
    )
  }

  // ── Uyarı satırları ────────────────────────────────────
  function AktifPasifWarning() {
    // Her sütun için aktif - pasif farkı
    const diffs = cols.map(col => {
      const aktif = getStoredVal(col.id, 'totalAssets')
      const pasif = getStoredVal(col.id, 'totalLiabilitiesAndEquity')
      if (aktif == null || pasif == null) return null
      return aktif - pasif
    })
    const anyDiff = diffs.some(d => d != null && Math.abs(d) > 0.5)
    if (!anyDiff) return null

    return (
      <tr className="bg-red-500/10 border-b border-red-500/20">
        <td
          colSpan={2}
          className="px-3 py-1.5 sticky left-0 bg-red-500/10 text-red-400 font-bold text-[10px] whitespace-nowrap"
          style={{ minWidth: LABEL_W + CODE_W }}
        >
          ⚠ AKTİF — PASİF FARKI
        </td>
        {cols.map((col, ci) => {
          const d = diffs[ci]
          return (
            <td key={col.id} className="px-3 py-1.5 text-right text-[10px] font-bold tabular-nums text-red-400">
              {d == null ? '—' : Math.abs(d) < 0.5 ? '✓' : fmtTR(d)}
            </td>
          )
        })}
        <td className="px-2 py-1 text-center text-white/20 text-[10px]">—</td>
        <td className="px-2 py-1 text-center text-white/20 text-[10px]">—</td>
      </tr>
    )
  }

  function NetKarWarning() {
    // Bilanço 59 (netProfitCurrentYear) vs GT net kar (netProfit)
    const diffs = cols.map(col => {
      const bilanco = getStoredVal(col.id, 'netProfitCurrentYear')
      const gt      = getStoredVal(col.id, 'netProfit')
      if (bilanco == null || gt == null) return null
      return bilanco - gt
    })
    const anyDiff = diffs.some(d => d != null && Math.abs(d) > 0.5)
    if (!anyDiff) return null

    return (
      <tr className="bg-red-500/10 border-b border-red-500/20">
        <td
          colSpan={2}
          className="px-3 py-1.5 sticky left-0 bg-red-500/10 text-red-400 font-bold text-[10px] whitespace-nowrap"
          style={{ minWidth: LABEL_W + CODE_W }}
        >
          ⚠ BİLANÇO — GT K/Z FARKI
        </td>
        {cols.map((col, ci) => {
          const d = diffs[ci]
          return (
            <td key={col.id} className="px-3 py-1.5 text-right text-[10px] font-bold tabular-nums text-red-400">
              {d == null ? '—' : Math.abs(d) < 0.5 ? '✓' : fmtTR(d)}
            </td>
          )
        })}
        <td className="px-2 py-1 text-center text-white/20 text-[10px]">—</td>
        <td className="px-2 py-1 text-center text-white/20 text-[10px]">—</td>
      </tr>
    )
  }

  // ── Satır render ───────────────────────────────────────
  const renderedRows: React.ReactNode[] = []

  TDHP_ROWS.forEach((row, i) => {
    // Bölüm başlığı
    if (row.type === 'header') {
      renderedRows.push(
        <tr key={`h${i}`} className="border-t-2 border-white/10 bg-white/2">
          <td
            colSpan={2 + cols.length + 2}
            className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-cyan-400 sticky left-0"
          >
            {row.label}
          </td>
        </tr>
      )
      return
    }

    const hasField = !!row.field
    const isTotal  = row.type === 'total'
    const isSubtot = row.type === 'subtotal'
    const isCalc   = isTotal || isSubtot

    const { son2, ilkSon } = hasField ? trendCells(row.field!) : { son2: null, ilkSon: null }

    renderedRows.push(
      <tr
        key={`r${i}`}
        className={clsx(
          'border-b border-white/5 transition-colors',
          isTotal  ? 'bg-white/3 hover:bg-white/5' :
          isSubtot ? 'bg-white/2 hover:bg-white/4' :
                     'hover:bg-white/2',
        )}
      >
        {/* Hesap adı — sticky */}
        <td
          className={clsx(
            'px-3 py-1 sticky left-0 z-10',
            isTotal  ? 'bg-[#0f1f35] font-black text-[#f59e0b]' :
            isSubtot ? 'bg-[#0d1b2e] font-bold text-[#f59e0b]' :
            hasField ? 'bg-[#0a1727] text-white/75' :
                       'bg-[#0a1727] text-white/25',
          )}
          style={{ minWidth: LABEL_W }}
        >
          {row.label}
        </td>

        {/* Kod — sticky */}
        <td
          className={clsx(
            'text-center px-1 py-1 sticky z-10',
            isCalc   ? 'bg-[#0d1b2e]' : 'bg-[#0a1727]',
            hasField ? 'text-white/40' : 'text-white/15',
          )}
          style={{ left: LABEL_W, width: CODE_W }}
        >
          {row.code ?? ''}
        </td>

        {/* Değer hücreleri */}
        {cols.map(col => {
          if (!hasField) {
            return (
              <td key={col.id} className="px-2 py-1 text-right">
                <span className="text-white/15 tabular-nums">0,00</span>
              </td>
            )
          }

          if (isCalc) {
            const v = getStoredVal(col.id, row.field!)
            return (
              <td key={col.id} className="px-2 py-1 text-right">
                <input
                  type="text"
                  value={getDisplayStr(col.id, row.field!)}
                  onFocus={(e) => handleFocus(col.id, row.field!, e)}
                  onChange={(e) => handleChange(col.id, row.field!, e.target.value)}
                  onBlur={() => handleBlur(col.id, row.field!)}
                  className={clsx(
                    'w-full bg-transparent text-right tabular-nums focus:outline-none focus:bg-white/10 focus:rounded px-1',
                    isTotal ? 'font-black text-[10px]' : 'font-bold text-[10px]',
                    v != null && v < 0 ? 'text-red-400' : 'text-[#f59e0b]',
                  )}
                  placeholder="0,00"
                />
              </td>
            )
          }

          const storedVal = getStoredVal(col.id, row.field!)
          const isNeg     = storedVal != null && storedVal < 0

          return (
            <td key={col.id} className="px-2 py-1">
              <input
                type="text"
                value={getDisplayStr(col.id, row.field!)}
                onFocus={(e) => handleFocus(col.id, row.field!, e)}
                onChange={(e) => handleChange(col.id, row.field!, e.target.value)}
                onBlur={() => handleBlur(col.id, row.field!)}
                className={clsx(
                  'w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5',
                  'text-right tabular-nums text-[10px] focus:outline-none focus:border-cyan-500/50',
                  isNeg ? 'text-red-400' : 'text-white',
                )}
                placeholder="0,00"
              />
            </td>
          )
        })}

        {/* Trend hücreleri */}
        {hasField
          ? <><TrendCell v={son2} /><TrendCell v={ilkSon} /></>
          : <><td className="px-2 py-1" /><td className="px-2 py-1" /></>
        }
      </tr>
    )

    // Aktif-Pasif uyarısı: pasif toplam'dan hemen sonra
    if (row.field === 'totalLiabilitiesAndEquity' && row.type === 'total') {
      renderedRows.push(<AktifPasifWarning key={`ap-warn-${i}`} />)
    }

    // Bilanço-GT K/Z uyarısı: dönem net karından hemen sonra
    if (row.field === 'netProfit' && row.type === 'total') {
      renderedRows.push(<NetKarWarning key={`nk-warn-${i}`} />)
    }
  })

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/3">
              <th
                className="text-left px-3 py-2.5 text-white/50 font-medium sticky left-0 bg-[#0a1727] z-10"
                style={{ minWidth: LABEL_W }}
              >
                HESAP ADI
              </th>
              <th
                className="text-center py-2.5 text-white/50 font-medium sticky bg-[#0a1727] z-10"
                style={{ left: LABEL_W, width: CODE_W }}
              >
                KOD
              </th>
              {cols.map(col => (
                <th key={col.id} className="text-right px-3 py-2 min-w-[130px]">
                  <div className="text-white font-bold">{col.year}</div>
                  <div className="text-[9px] text-white/40 font-normal mt-0.5">
                    {PERIOD_LABEL[col.period] ?? col.period}
                  </div>
                  {saving[col.id] && (
                    <div className="text-[8px] text-cyan-400 mt-0.5 animate-pulse">kaydediliyor</div>
                  )}
                </th>
              ))}
              {/* Trend başlıkları */}
              <th className="text-center px-2 py-2 min-w-[52px]">
                <div className="text-[9px] text-white/40 font-medium leading-tight">Son 2<br />Dönem</div>
              </th>
              <th className="text-center px-2 py-2 min-w-[52px]">
                <div className="text-[9px] text-white/40 font-medium leading-tight">İlk-Son<br />Dönem</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {renderedRows}
          </tbody>
        </table>
      </div>
    </div>
  )
}
