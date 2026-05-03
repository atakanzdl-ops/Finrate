'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import clsx from 'clsx'

// ─── Types ─────────────────────────────────────────────────
type RowType = 'header' | 'account' | 'subtotal' | 'total'

interface RowDef {
  type: RowType
  code?: string
  label: string
  field?: string
  additionalField?: string   // ikincil toplam alanı (görsel birleşim; edit sadece field'ı değiştirir)
}

interface FinData {
  id: string
  year: number
  period: string
  manualAdjustments?: Array<{ fieldName: string }>
  [key: string]: number | null | string | Array<{ fieldName: string }> | undefined
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
  { type: 'account', code: '10', label: 'Hazır Değerler',                             field: 'cash' },
  { type: 'account', code: '11', label: 'Menkul Kıymetler',                           field: 'shortTermInvestments' },
  { type: 'account', code: '12', label: 'Ticari Alacaklar',                           field: 'tradeReceivables' },
  { type: 'account', code: '13', label: 'Diğer Alacaklar',                            field: 'otherReceivables' },
  { type: 'account', code: '15+159', label: 'Stoklar (Verilen Sipariş Avansları dahil)', field: 'inventory', additionalField: 'prepaidSuppliers' },
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

  // BİLANÇO — PASİF
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
  { type: 'account', code: '59', label: 'Dönem Net Karı (Zararı)',                    field: 'netProfitCurrentYear' },
  { type: 'subtotal',            label: '▶ ÖZ KAYNAK TOPLAMI',                        field: 'totalEquity' },
  { type: 'total',               label: '▶▶ PASİF TOPLAM',                            field: 'totalLiabilitiesAndEquity' },

  // GELİR TABLOSU
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
  { type: 'subtotal',            label: '▶ OLAĞAN KAR / ZARAR',                       field: 'ordinaryProfit' },
  { type: 'account', code: '67', label: 'Olağandışı Gelir ve Karlar',                field: 'extraordinaryIncome' },
  { type: 'account', code: '68', label: 'Olağandışı Gider ve Zararlar (-)',           field: 'extraordinaryExpense' },
  { type: 'subtotal',            label: '▶ DÖNEM KARI / ZARARI',                      field: 'donemKari' },
  { type: 'account', code: '69', label: 'Dönem Karı Vergi Karşılıkları (-)',          field: 'taxExpense' },
  { type: 'total',               label: '▶▶ DÖNEM NET KARI / ZARARI',                 field: 'netProfit' },
]

// ─── Sabitler ──────────────────────────────────────────────
const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Kesin Beyan', Q1: '1. Geçici', Q2: '2. Geçici', Q3: '3. Geçici', Q4: '4. Geçici',
}
const CODE_W   = 44    // px — sticky kod sütun genişliği (ilk sütun)
const LABEL_W  = 216   // px — sticky label sütun genişliği (ikinci sütun)

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
  // editEnabled[fdId] = true ise o sütun düzenlenebilir; varsayılan kapalı
  const [editEnabled, setEditEnabled]   = useState<Record<string, boolean>>({})

  // fdId:fieldName çiftleri — manuel düzenlenmiş alanları hızlı lookup için
  const manualSet = new Set<string>()
  for (const col of cols) {
    for (const ma of (col.manualAdjustments ?? []) as Array<{ fieldName: string }>) {
      manualSet.add(`${col.id}:${ma.fieldName}`)
    }
  }

  function getStoredVal(fdId: string, field: string): number | null {
    const fd = cols.find(c => c.id === fdId)
    if (!fd) return null
    const v = fd[field]
    return typeof v === 'number' ? v : null
  }

  function sumNonNull(vals: Array<number | null>): number | null {
    const nums = vals.filter((v): v is number => v != null)
    if (nums.length === 0) return null
    return nums.reduce((a, b) => a + b, 0)
  }

  function getEffectiveVal(fdId: string, field: string, seen = new Set<string>()): number | null {
    const key = `${fdId}:${field}`
    if (seen.has(key)) return null

    const stored = getStoredVal(fdId, field)
    if (stored != null) return stored

    const next = new Set(seen)
    next.add(key)
    const g = (f: string) => getEffectiveVal(fdId, f, next)

    switch (field) {
      case 'netProfitCurrentYear':
        return g('netProfit')

      case 'revenue': {
        const grossSales = g('grossSales')
        const discounts = g('salesDiscounts')
        if (grossSales == null || discounts == null) return null
        return grossSales - discounts
      }

      case 'grossProfit': {
        const revenue = g('revenue')
        const cogs = g('cogs')
        if (revenue == null || cogs == null) return null
        return revenue - cogs
      }

      case 'ebit': {
        const grossProfit = g('grossProfit')
        const operatingExpenses = g('operatingExpenses')
        if (grossProfit == null || operatingExpenses == null) return null
        return grossProfit - operatingExpenses
      }

      // Olağan Kar = ebit + 64 - 65 - 66 (olağandışı dahil DEĞİL)
      // Stored ebt = olağan kar değeri (beyanname'den "ticari bilanço karı")
      case 'ordinaryProfit': {
        const ebit = g('ebit')
        if (ebit != null) {
          return (
            ebit +
            (g('otherIncome') ?? 0) -
            (g('otherExpense') ?? 0) -
            (g('interestExpense') ?? 0)
          )
        }
        // Fallback: stored ebt = olağan kar (beyanname'den, olağandışı dahil değil)
        return getStoredVal(fdId, 'ebt')
      }

      // Dönem Karı = Olağan Kar + 67 - 68 (her zaman hesaplanır)
      case 'donemKari': {
        const ordProfit = g('ordinaryProfit')
        if (ordProfit == null) return null
        return (
          ordProfit +
          (g('extraordinaryIncome') ?? 0) -
          (g('extraordinaryExpense') ?? 0)
        )
      }

      case 'ebt': {
        const ebit = g('ebit')
        if (ebit == null) return null
        return (
          ebit +
          (g('otherIncome') ?? 0) -
          (g('otherExpense') ?? 0) -
          (g('interestExpense') ?? 0) +
          (g('extraordinaryIncome') ?? 0) -
          (g('extraordinaryExpense') ?? 0)
        )
      }

      case 'netProfit': {
        const ebt = g('ebt')
        if (ebt == null) return null
        return ebt - (g('taxExpense') ?? 0)
      }

      case 'totalCurrentAssets':
        return sumNonNull([
          g('cash'),
          g('shortTermInvestments'),
          g('tradeReceivables'),
          g('otherReceivables'),
          g('inventory'),
          g('constructionCosts'),
          g('prepaidExpenses'),
          g('prepaidSuppliers'),
          g('otherCurrentAssets'),
        ])

      case 'totalNonCurrentAssets':
        return sumNonNull([
          g('longTermTradeReceivables'),
          g('longTermOtherReceivables'),
          g('longTermInvestments'),
          g('tangibleAssets'),
          g('intangibleAssets'),
          g('depletableAssets'),
          g('longTermPrepaidExpenses'),
          g('otherNonCurrentAssets'),
        ])

      case 'totalAssets':
        return sumNonNull([g('totalCurrentAssets'), g('totalNonCurrentAssets')])

      case 'totalCurrentLiabilities':
        return sumNonNull([
          g('shortTermFinancialDebt'),
          g('tradePayables'),
          g('otherShortTermPayables'),
          g('advancesReceived'),
          g('constructionProgress'),
          g('taxPayables'),
          g('shortTermProvisions'),
          g('deferredRevenue'),
          g('otherCurrentLiabilities'),
        ])

      case 'totalNonCurrentLiabilities':
        return sumNonNull([
          g('longTermFinancialDebt'),
          g('longTermTradePayables'),
          g('longTermOtherPayables'),
          g('longTermAdvancesReceived'),
          g('longTermProvisions'),
          g('otherNonCurrentLiabilities'),
        ])

      case 'totalEquity': {
        const losses = g('retainedLosses')
        const lossAdjustment = losses == null ? null : -Math.abs(losses)
        const periodNet = g('netProfitCurrentYear') ?? g('netProfit')
        return sumNonNull([
          g('paidInCapital'),
          g('capitalReserves'),
          g('profitReserves'),
          g('retainedEarnings'),
          lossAdjustment,
          periodNet,
        ])
      }

      case 'totalLiabilitiesAndEquity':
        return sumNonNull([
          g('totalCurrentLiabilities'),
          g('totalNonCurrentLiabilities'),
          g('totalEquity'),
        ])

      default:
        return null
    }
  }

  function getDisplayStr(fdId: string, field: string): string {
    const localStr = inputStrings[fdId]?.[field]
    if (localStr !== undefined) return localStr
    const v = getEffectiveVal(fdId, field)
    return v != null ? fmtTR(v) : ''
  }

  function handleFocus(fdId: string, field: string, e: React.FocusEvent<HTMLInputElement>) {
    const v = getEffectiveVal(fdId, field)
    const raw = v != null ? fmtTR(v) : ''
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
    const vals = cols.map(col => getEffectiveVal(col.id, field))
    const son2   = cols.length >= 2 ? calcPct(vals[cols.length - 2], vals[cols.length - 1]) : null
    const ilkSon = cols.length >= 2 ? calcPct(vals[0], vals[cols.length - 1])               : null
    return { son2, ilkSon }
  }

  function TrendCell({ v }: { v: number | null }) {
    if (v == null) return <td className="px-2 py-1 text-center text-slate-300 text-[10px]">—</td>
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
      const aktif = getEffectiveVal(col.id, 'totalAssets')
      const pasif = getEffectiveVal(col.id, 'totalLiabilitiesAndEquity')
      if (aktif == null || pasif == null) return null
      return aktif - pasif
    })
    const anyDiff = diffs.some(d => d != null && Math.abs(d) > 0.5)
    if (!anyDiff) return null

    return (
      <tr className="bg-red-50 border-b border-red-100">
        <td
          colSpan={2}
          className="px-3 py-1.5 sticky left-0 bg-red-50 text-red-700 font-bold text-[10px] whitespace-nowrap"
          style={{ minWidth: LABEL_W + CODE_W }}
        >
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
    // Bilanço 59 (netProfitCurrentYear) vs GT net kar (netProfit)
    const diffs = cols.map(col => {
      const bilanco = getEffectiveVal(col.id, 'netProfitCurrentYear')
      const gt      = getEffectiveVal(col.id, 'netProfit')
      if (bilanco == null || gt == null) return null
      return bilanco - gt
    })
    const anyDiff = diffs.some(d => d != null && Math.abs(d) > 0.5)
    if (!anyDiff) return null

    return (
      <tr className="bg-red-50 border-b border-red-100">
        <td
          colSpan={2}
          className="px-3 py-1.5 sticky left-0 bg-red-50 text-red-700 font-bold text-[10px] whitespace-nowrap"
          style={{ minWidth: LABEL_W + CODE_W }}
        >
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
    // Bölüm başlığı
    if (row.type === 'header') {
      renderedRows.push(
        <tr key={`h${i}`} className="border-t-2 border-slate-200 bg-slate-50">
          <td
            colSpan={2 + cols.length + 2}
            className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-[#0B3C5D] sticky left-0 bg-slate-50"
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
          'border-b border-slate-100 transition-colors',
          isTotal  ? 'bg-[#F0F7FA] hover:bg-[#EAF4F8]' :
          isSubtot ? 'bg-[#F8FBFD] hover:bg-[#F1F7FA]' :
                     'hover:bg-slate-50',
        )}
      >
        {/* Kod — sticky (ilk sütun) */}
        <td
          className={clsx(
            'text-center px-1 py-1 sticky left-0 z-10',
            isCalc   ? 'bg-[#F8FBFD] border-r border-slate-100' : 'bg-white border-r border-slate-100',
            hasField ? 'text-slate-500' : 'text-slate-300',
          )}
          style={{ width: CODE_W, minWidth: CODE_W, maxWidth: CODE_W }}
        >
          {row.code ?? ''}
        </td>

        {/* Hesap adı — sticky (ikinci sütun) */}
        <td
          className={clsx(
            'px-3 py-1 sticky z-10 text-[10px] truncate',
            isTotal  ? 'bg-[#F0F7FA] font-black text-[#0B3C5D] border-r border-slate-100' :
            isSubtot ? 'bg-[#F8FBFD] font-bold text-[#0B3C5D] border-r border-slate-100' :
            hasField ? 'bg-white text-slate-700 border-r border-slate-100' :
                       'bg-white text-slate-300 border-r border-slate-100',
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

          const isColEnabled = editEnabled[col.id] ?? false
          const isManualField = manualSet.has(`${col.id}:${row.field!}`)

          if (isCalc) {
            const v = getEffectiveVal(col.id, row.field!)
            return (
              <td key={col.id} className="px-2 py-1 text-right">
                <input
                  type="text"
                  value={getDisplayStr(col.id, row.field!)}
                  onFocus={(e) => handleFocus(col.id, row.field!, e)}
                  onChange={(e) => handleChange(col.id, row.field!, e.target.value)}
                  onBlur={() => handleBlur(col.id, row.field!)}
                  disabled={!isColEnabled}
                  className={clsx(
                    'w-full bg-transparent text-right tabular-nums focus:outline-none focus:bg-slate-100 focus:rounded px-1',
                    isTotal ? 'font-black text-[10px]' : 'font-bold text-[10px]',
                    v != null && v < 0 ? 'text-red-600' : 'text-[#0B3C5D]',
                    !isColEnabled && 'opacity-60 cursor-not-allowed',
                  )}
                  placeholder="0,00"
                />
              </td>
            )
          }

          const baseVal   = getEffectiveVal(col.id, row.field!)
          const addVal    = row.additionalField ? getEffectiveVal(col.id, row.additionalField) : null
          const storedVal = (baseVal != null || addVal != null)
            ? (baseVal ?? 0) + (addVal ?? 0)
            : null
          const isNeg     = storedVal != null && storedVal < 0
          // combined display when additionalField is set and user is not currently editing
          const isEditing  = inputStrings[col.id]?.[row.field!] !== undefined
          const displayVal = (!isEditing && row.additionalField && storedVal != null)
            ? fmtTR(storedVal)
            : getDisplayStr(col.id, row.field!)

          return (
            <td key={col.id} className="px-2 py-1">
              <div className="flex items-center gap-0.5">
                <input
                  type="text"
                  value={displayVal}
                  onFocus={(e) => handleFocus(col.id, row.field!, e)}
                  onChange={(e) => handleChange(col.id, row.field!, e.target.value)}
                  onBlur={() => handleBlur(col.id, row.field!)}
                  disabled={!isColEnabled}
                  className={clsx(
                    'flex-1 min-w-0 bg-white border border-slate-200 rounded px-1.5 py-0.5',
                    'text-right tabular-nums text-[10px] focus:outline-none focus:border-[#1FA4A9]/50',
                    isNeg ? 'text-red-600' : 'text-[#1E293B]',
                    !isColEnabled && 'opacity-60 cursor-not-allowed bg-slate-50',
                  )}
                  placeholder="0,00"
                />
                {isManualField && (
                  <Info
                    size={12}
                    className="flex-shrink-0 text-red-500"
                    title="Manuel düzenlenmiştir"
                  />
                )}
              </div>
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
    <div className="rounded-xl overflow-hidden border border-[#E5E9F0] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th
                className="text-center py-2.5 text-slate-500 font-medium sticky left-0 bg-slate-50 z-10 border-r border-slate-200"
                style={{ width: CODE_W, minWidth: CODE_W, maxWidth: CODE_W }}
              >
                KOD
              </th>
              <th
                className="text-left px-3 py-2.5 text-slate-500 font-medium sticky bg-slate-50 z-10 border-r border-slate-200"
                style={{ left: CODE_W, minWidth: LABEL_W }}
              >
                HESAP ADI
              </th>
              {cols.map(col => (
                <th key={col.id} className="text-right px-3 py-2 min-w-[130px]">
                  <div className="text-[#0B3C5D] font-bold">{col.year}</div>
                  <div className="mt-1 flex justify-end">
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: '#0B3C5D', color: '#ffffff' }}
                    >
                      {PERIOD_LABEL[col.period] ?? col.period}
                    </span>
                  </div>
                  {/* Manuel düzenleme kilidi */}
                  <label className="mt-1.5 flex items-center justify-end gap-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editEnabled[col.id] ?? false}
                      onChange={e =>
                        setEditEnabled(prev => ({ ...prev, [col.id]: e.target.checked }))
                      }
                      className="w-3 h-3 accent-[#1FA4A9]"
                    />
                    <span className="text-[8px] text-slate-400 font-medium">Manuel</span>
                  </label>
                  {saving[col.id] && (
                    <div className="text-[8px] text-[#1FA4A9] mt-0.5 animate-pulse">kaydediliyor</div>
                  )}
                </th>
              ))}
              {/* Trend başlıkları */}
              <th className="text-center px-2 py-2 min-w-[52px]">
                <div className="text-[9px] text-slate-500 font-medium leading-tight">Son 2<br />Dönem</div>
              </th>
              <th className="text-center px-2 py-2 min-w-[52px]">
                <div className="text-[9px] text-slate-500 font-medium leading-tight">İlk-Son<br />Dönem</div>
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
