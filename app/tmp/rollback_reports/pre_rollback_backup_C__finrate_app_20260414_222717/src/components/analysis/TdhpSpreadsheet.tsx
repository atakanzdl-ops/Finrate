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
  { type: 'header',  label: 'I. DÖNEN VARLIKLAR' },
  { type: 'account', code: '10', label: 'Hazır Değerler',                             field: 'cash' },
  { type: 'account', code: '11', label: 'Menkul Kıymetler',                           field: 'shortTermInvestments' },
  { type: 'account', code: '12', label: 'Ticari Alacaklar',                           field: 'tradeReceivables' },
  { type: 'account', code: '13', label: 'Diğer Alacaklar',                            field: 'otherReceivables' },
  { type: 'account', code: '15', label: 'Stoklar',                                    field: 'inventory' },
  { type: 'account', code: '16', label: 'Verilen Sipariş Avansları',                  field: 'prepaidSuppliers' },
  { type: 'account', code: '17', label: 'Yıllara Yaygın İnş. ve Onarım Maliyetleri', field: 'constructionCosts' },
  { type: 'account', code: '18', label: 'Gelecek Aylara Ait Giderler',                field: 'prepaidExpenses' },
  { type: 'account', code: '19', label: 'Diğer Dönen Varlıklar',                      field: 'otherCurrentAssets' },
  { type: 'subtotal',            label: '▶ DÖNEN VARLIK TOPLAMI',                     field: 'totalCurrentAssets' },

  { type: 'header',  label: 'II. DURAN VARLIKLAR' },
  { type: 'account', code: '22', label: 'Ticari Alacaklar',                           field: 'longTermTradeReceivables' },
  { type: 'account', code: '23', label: 'Diğer Alacaklar',                            field: 'longTermOtherReceivables' },
  { type: 'account', code: '24', label: 'Mali Duran Varlıklar',                       field: 'longTermInvestments' },
  { type: 'account', code: '25', label: 'Maddi Duran Varlıklar',                      field: 'tangibleAssets' },
  { type: 'account', code: '26', label: 'Maddi Olmayan Duran Varlıklar',              field: 'intangibleAssets' },
  { type: 'account', code: '27', label: 'Özel Tükenmeye Tabi Varlıklar',             field: 'depletableAssets' },
  { type: 'account', code: '28', label: 'Gelecek Yıllara Ait Giderler',               field: 'longTermPrepaidExpenses' },
  { type: 'account', code: '29', label: 'Diğer Duran Varlıklar',                      field: 'otherNonCurrentAssets' },
  { type: 'subtotal',            label: '▶ DURAN VARLIK TOPLAMI',                     field: 'totalNonCurrentAssets' },
  { type: 'total',               label: '▶▶ AKTİF TOPLAM',                            field: 'totalAssets' },

  { type: 'header',  label: 'III. KISA VADELİ YABANCI KAYNAKLAR' },
  { type: 'account', code: '30', label: 'Mali Borçlar',                               field: 'shortTermFinancialDebt' },
  { type: 'account', code: '32', label: 'Ticari Borçlar',                             field: 'tradePayables' },
  { type: 'account', code: '33', label: 'Diğer Borçlar',                              field: 'otherShortTermPayables' },
  { type: 'account', code: '34', label: 'Alınan Avanslar',                            field: 'advancesReceived' },
  { type: 'account', code: '35', label: 'Yıllara Yaygın İnş. Hakedişleri',           field: 'constructionProgress' },
  { type: 'account', code: '36', label: 'Ödenecek Vergi ve Yükümlülükler',           field: 'taxPayables' },
  { type: 'account', code: '37', label: 'Borç ve Gider Karşılıkları',                 field: 'shortTermProvisions' },
  { type: 'account', code: '38', label: 'Gelecek Aylara Ait Gelirler',                field: 'deferredRevenue' },
  { type: 'account', code: '39', label: 'Diğer KV Yabancı Kaynaklar',                field: 'otherCurrentLiabilities' },
  { type: 'subtotal',            label: '▶ KV YABANCI KAYNAK TOPLAMI',                field: 'totalCurrentLiabilities' },

  { type: 'header',  label: 'IV. UZUN VADELİ YABANCI KAYNAKLAR' },
  { type: 'account', code: '40', label: 'Mali Borçlar',                               field: 'longTermFinancialDebt' },
  { type: 'account', code: '42', label: 'Ticari Borçlar',                             field: 'longTermTradePayables' },
  { type: 'account', code: '43', label: 'Diğer Borçlar',                              field: 'longTermOtherPayables' },
  { type: 'account', code: '44', label: 'Alınan Avanslar',                            field: 'longTermAdvancesReceived' },
  { type: 'account', code: '47', label: 'Borç ve Gider Karşılıkları',                 field: 'longTermProvisions' },
  { type: 'account', code: '49', label: 'Diğer UV Yabancı Kaynaklar',                field: 'otherNonCurrentLiabilities' },
  { type: 'subtotal',            label: '▶ UV YABANCI KAYNAK TOPLAMI',                field: 'totalNonCurrentLiabilities' },

  { type: 'header',  label: 'V. ÖZ KAYNAKLAR' },
  { type: 'account', code: '50', label: 'Ödenmiş Sermaye',                            field: 'paidInCapital' },
  { type: 'account', code: '52', label: 'Sermaye Yedekleri',                          field: 'capitalReserves' },
  { type: 'account', code: '54', label: 'Kar Yedekleri',                              field: 'profitReserves' },
  { type: 'account', code: '57', label: 'Geçmiş Yıllar Karları',                      field: 'retainedEarnings' },
  { type: 'account', code: '58', label: 'Geçmiş Yıllar Zararları (-)',                field: 'retainedLosses' },
  { type: 'account', code: '59', label: 'Dönem Net Karı (Zararı)',                    field: 'netProfit' },
  { type: 'subtotal',            label: '▶ ÖZ KAYNAK TOPLAMI',                        field: 'totalEquity' },
  { type: 'total',               label: '▶▶ PASİF TOPLAM',                            field: 'totalLiabilitiesAndEquity' },

  { type: 'header',  label: 'GELİR TABLOSU' },
  { type: 'account', code: '60', label: 'Brüt Satışlar',                              field: 'grossSales' },
  { type: 'account', code: '61', label: 'Satış İndirimleri (-)',                      field: 'salesDiscounts' },
  { type: 'subtotal',            label: '▶ NET SATIŞLAR',                             field: 'revenue' },
  { type: 'account', code: '62', label: 'Satışların Maliyeti (-)',                    field: 'cogs' },
  { type: 'subtotal',            label: '▶ BRÜT SATIŞ KARI / ZARARI',                field: 'grossProfit' },
  { type: 'account', code: '63', label: 'Faaliyet Giderleri (-)',                     field: 'operatingExpenses' },
  { type: 'subtotal',            label: '▶ FAALİYET KARI / ZARARI',                   field: 'ebit' },
  { type: 'account', code: '64', label: 'Diğer Olağan Gelir ve Karlar',              field: 'otherIncome' },
  { type: 'account', code: '65', label: 'Diğer Olağan Gider ve Zararlar (-)',        field: 'otherExpense' },
  { type: 'account', code: '66', label: 'Finansman Giderleri (-)',                    field: 'interestExpense' },
  { type: 'subtotal',            label: '▶ OLAĞAN KAR / ZARAR',                       field: 'ebt' },
  { type: 'account', code: '67', label: 'Olağandışı Gelir ve Karlar',                field: 'extraordinaryIncome' },
  { type: 'account', code: '68', label: 'Olağandışı Gider ve Zararlar (-)',           field: 'extraordinaryExpense' },
  { type: 'subtotal',            label: '▶ DÖNEM KARI / ZARARI',                      field: 'ebt' },
  { type: 'account', code: '69', label: 'Dönem Karı Vergi Karşılıkları (-)',          field: 'taxExpense' },
  { type: 'total',               label: '▶▶ DÖNEM NET KARI / ZARARI',                 field: 'netProfit' },
]

// ─── Alan → Etkilenen toplamlar haritası ─────────────────
const CURRENT_ASSET_FIELDS  = ['cash','tradeReceivables','inventory','prepaidSuppliers','prepaidExpenses','otherCurrentAssets','otherReceivables']
const NON_CURRENT_ASSET_FIELDS = ['tangibleAssets','intangibleAssets','longTermPrepaidExpenses','longTermInvestments']
const CURRENT_LIABILITY_FIELDS = ['shortTermFinancialDebt','tradePayables','otherShortTermPayables','advancesReceived','taxPayables','deferredRevenue','constructionProgress','otherCurrentLiabilities']
const NON_CURRENT_LIABILITY_FIELDS = ['longTermFinancialDebt','longTermTradePayables','otherNonCurrentLiabilities']
const EQUITY_FIELDS = ['paidInCapital','capitalReserves','profitReserves','equityOther','retainedEarnings','retainedLosses']
const ALL_LEAF_FIELDS = new Set([...CURRENT_ASSET_FIELDS, ...NON_CURRENT_ASSET_FIELDS, ...CURRENT_LIABILITY_FIELDS, ...NON_CURRENT_LIABILITY_FIELDS, ...EQUITY_FIELDS])

// ─── Sabitler ──────────────────────────────────────────────
const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Kesin Beyan', Q1: '1. Geçici', Q2: '2. Geçici', Q3: '3. Geçici', Q4: '4. Geçici',
}
const CODE_W  = 44
const LABEL_W = 216

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
  const [origVals, setOrigVals]         = useState<Record<string, Record<string, number | null>>>({})
  const [manualCols, setManualCols]     = useState<Set<string>>(new Set())

  // Manuel düzeltme: { fdId -> { field -> originalValue } }, localStorage'da kalıcı
  const [overrides, setOverrides] = useState<Record<string, Record<string, number | null>>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const s = localStorage.getItem(`fin-overrides-${entityId}`)
      if (s) return JSON.parse(s) as Record<string, Record<string, number | null>>
    } catch {}
    return {}
  })

  function persistOverrides(next: Record<string, Record<string, number | null>>) {
    setOverrides(next)
    try { localStorage.setItem(`fin-overrides-${entityId}`, JSON.stringify(next)) } catch {}
  }

  function getOriginal(fdId: string, field: string): number | null | undefined {
    return overrides[fdId]?.[field]  // undefined = not overridden
  }

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

  // Etkilenen toplamları yeniden hesapla
  function computeAffectedTotals(fdId: string, changedField: string, newVal: number | null): Record<string, number> {
    if (!ALL_LEAF_FIELDS.has(changedField)) return {}
    const get = (f: string) => f === changedField ? (newVal ?? 0) : (getStoredVal(fdId, f) ?? 0)
    const sum = (fields: string[]) => fields.reduce((s, f) => s + get(f), 0)

    const tCA  = sum(CURRENT_ASSET_FIELDS)
    const tNCA = sum(NON_CURRENT_ASSET_FIELDS)
    const tCL  = sum(CURRENT_LIABILITY_FIELDS)
    const tNCL = sum(NON_CURRENT_LIABILITY_FIELDS)
    const tEq  = get('paidInCapital') + get('capitalReserves') + get('profitReserves') +
                 get('equityOther') + get('retainedEarnings') - Math.abs(get('retainedLosses'))

    return {
      totalCurrentAssets:          tCA,
      totalNonCurrentAssets:        tNCA,
      totalAssets:                  tCA + tNCA,
      totalCurrentLiabilities:      tCL,
      totalNonCurrentLiabilities:   tNCL,
      totalEquity:                  tEq,
      totalLiabilitiesAndEquity:    tCL + tNCL + tEq,
    }
  }

  function handleFocus(fdId: string, field: string, e: React.FocusEvent<HTMLInputElement>) {
    const v = getStoredVal(fdId, field)
    setOrigVals(prev => ({ ...prev, [fdId]: { ...(prev[fdId] ?? {}), [field]: v } }))
    const raw = v != null ? fmtTR(v) : ''
    setInputStrings(prev => ({ ...prev, [fdId]: { ...(prev[fdId] ?? {}), [field]: raw } }))
    e.target.value = raw
    e.target.select()
  }

  function handleChange(fdId: string, field: string, value: string) {
    setInputStrings(prev => ({ ...prev, [fdId]: { ...(prev[fdId] ?? {}), [field]: value } }))
  }

  async function handleBlur(fdId: string, field: string) {
    const rawStr  = inputStrings[fdId]?.[field] ?? ''
    const parsed  = parseTR(rawStr)
    const origVal = origVals[fdId]?.[field] ?? null

    setInputStrings(prev => ({
      ...prev,
      [fdId]: { ...(prev[fdId] ?? {}), [field]: parsed != null ? fmtTR(parsed) : '' },
    }))
    setSaving(prev => ({ ...prev, [fdId]: true }))
    try {
      const totals = computeAffectedTotals(fdId, field, parsed)
      const patchBody: Record<string, number | null> = { [field]: parsed, ...totals }

      await fetch(`/api/entities/${entityId}/financial-data/${fdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })

      // Değer değiştiyse override kaydı yap (orijinal değeri sakla)
      if (parsed !== origVal) {
        const next = { ...overrides, [fdId]: { ...(overrides[fdId] ?? {}) } }
        const existingOriginal = overrides[fdId]?.[field]
        const effectiveOriginal = existingOriginal !== undefined ? existingOriginal : origVal

        if (parsed === effectiveOriginal || (parsed === null && effectiveOriginal === null)) {
          // Orijinal değere geri döndü — override kaldır
          delete next[fdId][field]
        } else {
          // İlk override — orijinali kaydet
          if (existingOriginal === undefined) next[fdId][field] = origVal
        }
        persistOverrides(next)
      }

      onRefresh()
    } finally {
      setSaving(prev => ({ ...prev, [fdId]: false }))
    }
  }

  function trendCells(field: string) {
    const vals = cols.map(col => getStoredVal(col.id, field))
    const son2   = cols.length >= 2 ? calcPct(vals[cols.length - 2], vals[cols.length - 1]) : null
    const ilkSon = cols.length >= 2 ? calcPct(vals[0], vals[cols.length - 1])               : null
    return { son2, ilkSon }
  }

  function TrendCell({ v }: { v: number | null }) {
    if (v == null) return <td className="px-2 py-1 text-center text-slate-300 text-[10px]">—</td>
    const pos = v >= 0
    return (
      <td className={clsx('px-2 py-1 text-center text-[10px] font-bold tabular-nums', pos ? 'text-emerald-400' : 'text-red-400')}>
        {fmtPct(v)}
      </td>
    )
  }

  function AktifPasifWarning() {
    const diffs = cols.map(col => {
      const aktif = getStoredVal(col.id, 'totalAssets')
      const pasif = getStoredVal(col.id, 'totalLiabilitiesAndEquity')
      if (aktif == null || pasif == null) return null
      return aktif - pasif
    })
    if (!diffs.some(d => d != null && Math.abs(d) > 0.5)) return null
    return (
      <tr className="bg-red-50 border-b border-red-100">
        <td colSpan={2} className="px-3 py-1.5 sticky left-0 bg-red-50 text-red-700 font-bold text-[10px] whitespace-nowrap" style={{ minWidth: LABEL_W + CODE_W }}>
          ⚠ AKTİF — PASİF FARKI
        </td>
        {cols.map((col, ci) => {
          const d = diffs[ci]
          return (
            <td key={col.id} className="px-3 py-1.5 text-right text-[10px] font-bold tabular-nums text-red-700">
              {d == null ? '—' : Math.abs(d) < 0.5 ? '✓' : fmtTR(d)}
            </td>
          )
        })}
        <td className="px-2 py-1 text-center text-slate-300 text-[10px]">—</td>
        <td className="px-2 py-1 text-center text-slate-300 text-[10px]">—</td>
      </tr>
    )
  }

  function NetKarWarning() {
    const diffs = cols.map(col => {
      const bilanco = getStoredVal(col.id, 'netProfitCurrentYear')
      const gt      = getStoredVal(col.id, 'netProfit')
      if (bilanco == null || gt == null) return null
      return bilanco - gt
    })
    if (!diffs.some(d => d != null && Math.abs(d) > 0.5)) return null
    return (
      <tr className="bg-red-50 border-b border-red-100">
        <td colSpan={2} className="px-3 py-1.5 sticky left-0 bg-red-50 text-red-700 font-bold text-[10px] whitespace-nowrap" style={{ minWidth: LABEL_W + CODE_W }}>
          ⚠ BİLANÇO — GT K/Z FARKI
        </td>
        {cols.map((col, ci) => {
          const d = diffs[ci]
          return (
            <td key={col.id} className="px-3 py-1.5 text-right text-[10px] font-bold tabular-nums text-red-700">
              {d == null ? '—' : Math.abs(d) < 0.5 ? '✓' : fmtTR(d)}
            </td>
          )
        })}
        <td className="px-2 py-1 text-center text-slate-300 text-[10px]">—</td>
        <td className="px-2 py-1 text-center text-slate-300 text-[10px]">—</td>
      </tr>
    )
  }

  // ── Satır render ───────────────────────────────────────
  const renderedRows: React.ReactNode[] = []

  TDHP_ROWS.forEach((row, i) => {
    if (row.type === 'header') {
      renderedRows.push(
        <tr key={`h${i}`} className="border-t-2 border-slate-200 bg-slate-50">
          <td colSpan={2 + cols.length + 2} className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-[#0B3C5D] sticky left-0 bg-slate-50">
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
          'border-b border-slate-100 transition-colors',
          isTotal  ? 'bg-[#F0F7FA] hover:bg-[#EAF4F8]' :
          isSubtot ? 'bg-[#F8FBFD] hover:bg-[#F1F7FA]' : 'hover:bg-slate-50',
        )}
      >
        {/* Kod */}
        <td
          className={clsx('text-center px-1 py-1 sticky left-0 z-10 border-r border-slate-100',
            isCalc ? 'bg-[#F8FBFD]' : 'bg-white',
            hasField ? 'text-slate-500' : 'text-slate-300',
          )}
          style={{ width: CODE_W, minWidth: CODE_W, maxWidth: CODE_W }}
        >
          {row.code ?? ''}
        </td>

        {/* Hesap adı */}
        <td
          className={clsx('px-3 py-1 sticky z-10 text-[10px] truncate border-r border-slate-100',
            isTotal  ? 'bg-[#F0F7FA] font-black text-[#0B3C5D]' :
            isSubtot ? 'bg-[#F8FBFD] font-bold text-[#0B3C5D]' :
            hasField ? 'bg-white text-slate-700' : 'bg-white text-slate-300',
          )}
          style={{ left: CODE_W, minWidth: LABEL_W }}
        >
          {row.label}
        </td>

        {/* Değer hücreleri */}
        {cols.map(col => {
          if (!hasField) {
            return (
              <td key={col.id} className="px-2 py-1 text-right">
                <span className="text-slate-300 tabular-nums">0,00</span>
              </td>
            )
          }

          const originalVal = getOriginal(col.id, row.field!)  // undefined = no override
          const hasOverride = originalVal !== undefined
          const storedVal   = getStoredVal(col.id, row.field!)
          const isNeg       = storedVal != null && storedVal < 0
          const isManual    = manualCols.has(col.id)

          if (isCalc) {
            const v = getStoredVal(col.id, row.field!)
            return (
              <td key={col.id} className="px-2 py-1 text-right">
                {hasOverride && (
                  <div className="text-[9px] text-slate-400 line-through text-right tabular-nums leading-none mb-0.5" title="Orijinal değer">
                    {originalVal != null ? fmtTR(originalVal) : '0,00'}
                  </div>
                )}
                {isManual ? (
                  <input
                    type="text"
                    value={getDisplayStr(col.id, row.field!)}
                    onFocus={(e) => handleFocus(col.id, row.field!, e)}
                    onChange={(e) => handleChange(col.id, row.field!, e.target.value)}
                    onBlur={() => handleBlur(col.id, row.field!)}
                    className={clsx(
                      'w-full bg-transparent text-right tabular-nums focus:outline-none focus:bg-amber-50 focus:rounded px-1',
                      isTotal ? 'font-black text-[10px]' : 'font-bold text-[10px]',
                      v != null && v < 0 ? 'text-red-600' : 'text-[#0B3C5D]',
                    )}
                    placeholder="0,00"
                  />
                ) : (
                  <span className={clsx(
                    'block text-right tabular-nums px-1',
                    isTotal ? 'font-black text-[10px]' : 'font-bold text-[10px]',
                    v != null && v < 0 ? 'text-red-600' : 'text-[#0B3C5D]',
                  )}>
                    {getDisplayStr(col.id, row.field!) || '0,00'}
                  </span>
                )}
              </td>
            )
          }

          return (
            <td key={col.id} className="px-2 py-1">
              {hasOverride && (
                <div className="text-[9px] text-slate-400 line-through text-right tabular-nums leading-none mb-0.5" title="Orijinal değer">
                  {originalVal != null ? fmtTR(originalVal) : '0,00'}
                </div>
              )}
              {isManual ? (
                <input
                  type="text"
                  value={getDisplayStr(col.id, row.field!)}
                  onFocus={(e) => handleFocus(col.id, row.field!, e)}
                  onChange={(e) => handleChange(col.id, row.field!, e.target.value)}
                  onBlur={() => handleBlur(col.id, row.field!)}
                  className={clsx(
                    'w-full rounded px-1.5 py-0.5 text-right tabular-nums text-[10px] focus:outline-none',
                    hasOverride
                      ? 'bg-amber-50 border border-amber-300 focus:border-amber-400'
                      : 'bg-white border border-amber-200 focus:border-amber-400',
                    isNeg ? 'text-red-600' : 'text-slate-900',
                  )}
                  placeholder="0,00"
                />
              ) : (
                <span className={clsx(
                  'block w-full rounded px-1.5 py-0.5 text-right tabular-nums text-[10px]',
                  hasOverride ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-slate-200',
                  isNeg ? 'text-red-600' : 'text-slate-900',
                )}>
                  {getDisplayStr(col.id, row.field!) || '0,00'}
                </span>
              )}
            </td>
          )
        })}

        {/* Trend */}
        {hasField
          ? <><TrendCell v={son2} /><TrendCell v={ilkSon} /></>
          : <><td className="px-2 py-1" /><td className="px-2 py-1" /></>
        }
      </tr>
    )

    if (row.field === 'totalLiabilitiesAndEquity' && row.type === 'total') {
      renderedRows.push(<AktifPasifWarning key={`ap-warn-${i}`} />)
    }
    if (row.field === 'netProfit' && row.type === 'total') {
      renderedRows.push(<NetKarWarning key={`nk-warn-${i}`} />)
    }
  })

  return (
    <div className="rounded-xl overflow-hidden border border-[#E5E9F0] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-center py-2.5 text-slate-500 font-medium sticky left-0 bg-slate-50 z-10 border-r border-slate-200"
                style={{ width: CODE_W, minWidth: CODE_W, maxWidth: CODE_W }}>
                KOD
              </th>
              <th className="text-left px-3 py-2.5 text-slate-500 font-medium sticky bg-slate-50 z-10 border-r border-slate-200"
                style={{ left: CODE_W, minWidth: LABEL_W }}>
                HESAP ADI
              </th>
              {cols.map(col => {
                const isManual = manualCols.has(col.id)
                return (
                  <th key={col.id} className="text-right px-3 py-2 min-w-[130px]">
                    <div className="text-slate-800 font-bold">{col.year}</div>
                    <div className="mt-1 flex justify-end">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#0B3C5D', color: '#ffffff' }}>
                        {PERIOD_LABEL[col.period] ?? col.period}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-end gap-1">
                      <label className={clsx('flex items-center gap-1 cursor-pointer select-none rounded px-1.5 py-0.5 transition-colors', isManual ? 'bg-amber-50' : 'hover:bg-slate-100')}>
                        <input
                          type="checkbox"
                          checked={isManual}
                          onChange={e => {
                            setManualCols(prev => {
                              const next = new Set(prev)
                              e.target.checked ? next.add(col.id) : next.delete(col.id)
                              return next
                            })
                          }}
                          className="accent-amber-500 w-3 h-3"
                        />
                        <span className={clsx('text-[9px] font-medium', isManual ? 'text-amber-600' : 'text-slate-400')}>
                          Manuel
                        </span>
                      </label>
                    </div>
                    {saving[col.id] && <div className="text-[8px] text-[#1FA4A9] mt-0.5 animate-pulse">kaydediliyor</div>}
                  </th>
                )
              })}
              <th className="text-center px-2 py-2 min-w-[52px]">
                <div className="text-[9px] text-slate-500 font-medium leading-tight">Son 2<br />Dönem</div>
              </th>
              <th className="text-center px-2 py-2 min-w-[52px]">
                <div className="text-[9px] text-slate-500 font-medium leading-tight">İlk-Son<br />Dönem</div>
              </th>
            </tr>
          </thead>
          <tbody>{renderedRows}</tbody>
        </table>
      </div>
    </div>
  )
}
