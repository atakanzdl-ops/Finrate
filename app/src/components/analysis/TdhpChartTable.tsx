'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { TDHP_GROUPS, TDHP_SECTION_LABEL, type TdhpSection } from '@/lib/tdhp/chart'
import { PERIOD_LABEL_SHORT } from '@/lib/periods'

interface AccountRow { accountCode: string; amount: number }
export interface ChartFinData {
  id: string
  year: number
  period: string
  analysis?: { id: string; financialAccounts: AccountRow[] } | null
}

interface Props {
  entityId: string
  data: ChartFinData[]
  onRefresh: () => void
}

const CODE_W = 44
const LABEL_W = 260

function fmtTR(v: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}
function parseTR(s: string): number | null {
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const SECTION_ORDER: TdhpSection[] = [
  'DONEN_VARLIKLAR', 'DURAN_VARLIKLAR', 'KV_YABANCI_KAYNAKLAR', 'UV_YABANCI_KAYNAKLAR', 'OZKAYNAKLAR', 'GELIR_TABLOSU',
]

export function TdhpChartTable({ entityId, data, onRefresh }: Props) {
  const cols = useMemo(
    () => [...data].sort((a, b) => a.year - b.year || a.period.localeCompare(b.period)),
    [data],
  )
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<Record<string, string>>({})   // key: fdId:code
  const [saving, setSaving]   = useState<Record<string, boolean>>({})
  const [error, setError]     = useState<string | null>(null)

  // amounts[fdId][code] — bakiye büyüklüğü
  const amounts = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const c of cols) {
      m[c.id] = {}
      for (const acc of c.analysis?.financialAccounts ?? []) {
        m[c.id][acc.accountCode] = (m[c.id][acc.accountCode] ?? 0) + Number(acc.amount)
      }
    }
    return m
  }, [cols])

  const amt = (fdId: string, code: string) => amounts[fdId]?.[code] ?? 0

  // İşaretli tutar: kontra hesaplar eksi
  const signed = (fdId: string, code: string, contra?: boolean) => (contra ? -1 : 1) * amt(fdId, code)

  const groupTotal = (fdId: string, groupCode: string) => {
    const g = TDHP_GROUPS.find(x => x.code === groupCode)!
    return g.accounts.reduce((s, a) => s + signed(fdId, a.code, a.contra), 0)
  }
  const sectionTotal = (fdId: string, section: TdhpSection) =>
    TDHP_GROUPS.filter(g => g.section === section).reduce((s, g) => s + groupTotal(fdId, g.code), 0)

  const hasAnyAccounts = (fdId: string) => Object.keys(amounts[fdId] ?? {}).length > 0

  async function save(fdId: string, code: string) {
    const key = `${fdId}:${code}`
    const raw = editing[key]
    if (raw === undefined) return
    const parsed = parseTR(raw) ?? 0
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n })
    if (Math.abs(parsed - amt(fdId, code)) < 0.005) return
    setSaving(prev => ({ ...prev, [key]: true }))
    setError(null)
    try {
      const res = await fetch(`/api/entities/${entityId}/financial-data/${fdId}/accounts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, amount: Math.abs(parsed) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `Kaydedilemedi (HTTP ${res.status})`)
        return
      }
      onRefresh()
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  // ── Satır yardımcıları ──────────────────────────────────────────────────
  const stickyCode  = 'sticky left-0 z-10 border-r border-slate-100 text-center px-1 py-1'
  const stickyLabel = 'sticky z-10 border-r border-slate-100 px-3 py-1 text-[10px] truncate'

  function ValueCells({ compute, bold, cls }: { compute: (fdId: string) => number; bold?: boolean; cls?: string }) {
    return (
      <>
        {cols.map(col => {
          const v = compute(col.id)
          return (
            <td key={col.id} className={clsx('px-2 py-1 text-right tabular-nums text-[10px]', bold && 'font-bold', v < 0 ? 'text-red-600' : 'text-[#0B3C5D]', cls)}>
              {fmtTR(v)}
            </td>
          )
        })}
      </>
    )
  }

  function TotalRow({ label, compute, level }: { label: string; compute: (fdId: string) => number; level: 'group' | 'section' | 'grand' }) {
    const bg = level === 'grand' ? 'bg-[#F0F7FA]' : level === 'section' ? 'bg-[#F8FBFD]' : 'bg-slate-50/60'
    return (
      <tr className={clsx('border-b border-slate-100', bg)}>
        <td className={clsx(stickyCode, bg)} style={{ width: CODE_W, minWidth: CODE_W }} />
        <td className={clsx(stickyLabel, bg, level === 'grand' ? 'font-black text-[#0B3C5D]' : 'font-bold text-[#0B3C5D]')} style={{ left: CODE_W, minWidth: LABEL_W }}>
          {label}
        </td>
        <ValueCells compute={compute} bold />
      </tr>
    )
  }

  const rows: React.ReactNode[] = []

  for (const section of SECTION_ORDER) {
    const groups = TDHP_GROUPS.filter(g => g.section === section)
    rows.push(
      <tr key={`sec-${section}`} className="border-t-2 border-slate-200 bg-slate-50">
        <td colSpan={2 + cols.length} className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-[#0B3C5D] sticky left-0 bg-slate-50">
          {TDHP_SECTION_LABEL[section]}
        </td>
      </tr>,
    )

    for (const g of groups) {
      const visibleAccounts = g.accounts.filter(a => showAll || cols.some(c => amt(c.id, a.code) !== 0))
      if (visibleAccounts.length === 0) continue

      rows.push(
        <tr key={`g-${g.code}`} className="bg-white border-b border-slate-100">
          <td className={clsx(stickyCode, 'bg-white font-bold text-slate-600')} style={{ width: CODE_W, minWidth: CODE_W }}>{g.code}</td>
          <td className={clsx(stickyLabel, 'bg-white font-bold text-slate-700 uppercase')} style={{ left: CODE_W, minWidth: LABEL_W }}>{g.name}</td>
          {cols.map(col => <td key={col.id} />)}
        </tr>,
      )

      for (const a of visibleAccounts) {
        rows.push(
          <tr key={`a-${a.code}`} className="border-b border-slate-50 hover:bg-slate-50">
            <td className={clsx(stickyCode, 'bg-white text-slate-500')} style={{ width: CODE_W, minWidth: CODE_W }}>{a.code}</td>
            <td className={clsx(stickyLabel, 'bg-white', a.contra ? 'text-red-700' : 'text-slate-700')} style={{ left: CODE_W, minWidth: LABEL_W, paddingLeft: 24 }}>
              {a.name}
            </td>
            {cols.map(col => {
              const key = `${col.id}:${a.code}`
              const v = amt(col.id, a.code)
              const display = editing[key] ?? (v !== 0 ? fmtTR(v) : '')
              return (
                <td key={col.id} className="px-2 py-0.5">
                  <input
                    type="text"
                    value={display}
                    onFocus={e => { setEditing(prev => ({ ...prev, [key]: v !== 0 ? fmtTR(v) : '' })); e.target.select() }}
                    onChange={e => setEditing(prev => ({ ...prev, [key]: e.target.value }))}
                    onBlur={() => save(col.id, a.code)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    disabled={saving[key]}
                    placeholder="0,00"
                    className={clsx(
                      'w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right tabular-nums text-[10px]',
                      'focus:outline-none focus:border-[#1FA4A9]/50 disabled:opacity-50',
                      a.contra ? 'text-red-700' : 'text-[#1E293B]',
                    )}
                  />
                </td>
              )
            })}
          </tr>,
        )
      }

      rows.push(<TotalRow key={`gt-${g.code}`} label={`${g.code} ${g.name} Toplamı`} compute={fdId => groupTotal(fdId, g.code)} level="group" />)
    }

    // Bölüm toplamı ve genel toplamlar
    if (section === 'DONEN_VARLIKLAR')      rows.push(<TotalRow key="t-dv"  label="▶ DÖNEN VARLIK TOPLAMI"      compute={f => sectionTotal(f, 'DONEN_VARLIKLAR')} level="section" />)
    if (section === 'DURAN_VARLIKLAR') {
      rows.push(<TotalRow key="t-drv" label="▶ DURAN VARLIK TOPLAMI"      compute={f => sectionTotal(f, 'DURAN_VARLIKLAR')} level="section" />)
      rows.push(<TotalRow key="t-akt" label="▶▶ AKTİF TOPLAM"             compute={f => sectionTotal(f, 'DONEN_VARLIKLAR') + sectionTotal(f, 'DURAN_VARLIKLAR')} level="grand" />)
    }
    if (section === 'KV_YABANCI_KAYNAKLAR') rows.push(<TotalRow key="t-kv"  label="▶ KV YABANCI KAYNAK TOPLAMI"  compute={f => sectionTotal(f, 'KV_YABANCI_KAYNAKLAR')} level="section" />)
    if (section === 'UV_YABANCI_KAYNAKLAR') rows.push(<TotalRow key="t-uv"  label="▶ UV YABANCI KAYNAK TOPLAMI"  compute={f => sectionTotal(f, 'UV_YABANCI_KAYNAKLAR')} level="section" />)
    if (section === 'OZKAYNAKLAR') {
      rows.push(<TotalRow key="t-oz"  label="▶ ÖZ KAYNAK TOPLAMI"         compute={f => sectionTotal(f, 'OZKAYNAKLAR')} level="section" />)
      rows.push(<TotalRow key="t-pas" label="▶▶ PASİF TOPLAM"             compute={f => sectionTotal(f, 'KV_YABANCI_KAYNAKLAR') + sectionTotal(f, 'UV_YABANCI_KAYNAKLAR') + sectionTotal(f, 'OZKAYNAKLAR')} level="grand" />)
      rows.push(
        <tr key="t-fark" className="bg-amber-50/60 border-b border-amber-100">
          <td className={clsx(stickyCode, 'bg-amber-50/60')} style={{ width: CODE_W, minWidth: CODE_W }} />
          <td className={clsx(stickyLabel, 'bg-amber-50/60 font-bold text-amber-800')} style={{ left: CODE_W, minWidth: LABEL_W }}>Aktif − Pasif farkı</td>
          {cols.map(col => {
            const d = sectionTotal(col.id, 'DONEN_VARLIKLAR') + sectionTotal(col.id, 'DURAN_VARLIKLAR')
                    - sectionTotal(col.id, 'KV_YABANCI_KAYNAKLAR') - sectionTotal(col.id, 'UV_YABANCI_KAYNAKLAR') - sectionTotal(col.id, 'OZKAYNAKLAR')
            return <td key={col.id} className={clsx('px-2 py-1 text-right tabular-nums text-[10px] font-bold', Math.abs(d) < 0.5 ? 'text-emerald-600' : 'text-amber-800')}>{Math.abs(d) < 0.5 ? '✓' : fmtTR(d)}</td>
          })}
        </tr>,
      )
    }
    if (section === 'GELIR_TABLOSU') {
      const gt = (f: string, code: string) => groupTotal(f, code)
      const netSales   = (f: string) => gt(f, '60') + gt(f, '61')
      const grossP     = (f: string) => netSales(f) + gt(f, '62')
      const ebit       = (f: string) => grossP(f) + gt(f, '63')
      const ordinary   = (f: string) => ebit(f) + gt(f, '64') + gt(f, '65') + gt(f, '66')
      const pretax     = (f: string) => ordinary(f) + gt(f, '67') + gt(f, '68')
      const net        = (f: string) => pretax(f) - amt(f, '691')
      rows.push(<TotalRow key="t-ns"  label="▶ NET SATIŞLAR"              compute={netSales} level="section" />)
      rows.push(<TotalRow key="t-bk"  label="▶ BRÜT SATIŞ KARI / ZARARI"   compute={grossP}   level="section" />)
      rows.push(<TotalRow key="t-fk"  label="▶ FAALİYET KARI / ZARARI"     compute={ebit}     level="section" />)
      rows.push(<TotalRow key="t-ok"  label="▶ OLAĞAN KAR / ZARAR"         compute={ordinary} level="section" />)
      rows.push(<TotalRow key="t-dk"  label="▶ DÖNEM KARI / ZARARI"        compute={pretax}   level="section" />)
      rows.push(<TotalRow key="t-nk"  label="▶▶ DÖNEM NET KARI / ZARARI"   compute={net}      level="grand" />)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[#E5E9F0] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/60">
        <p className="text-[11px] text-slate-500">
          Tekdüzen Hesap Planı — 3 haneli hesaplar. Tutarlar bakiye büyüklüğüdür; (-) işaretli kontra hesaplar toplamdan düşülür.
          Bir hesabı değiştirmek yalnızca o hesabın bağlı olduğu kalemi günceller.
        </p>
        <label className="flex items-center gap-2 text-[11px] text-slate-600 whitespace-nowrap cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Tüm hesapları göster
        </label>
      </div>
      {error && <div className="px-4 py-2 text-[11px] text-red-600 bg-red-50 border-b border-red-100">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-center py-2.5 text-slate-500 font-medium sticky left-0 bg-slate-50 z-10 border-r border-slate-200" style={{ width: CODE_W, minWidth: CODE_W }}>KOD</th>
              <th className="text-left px-3 py-2.5 text-slate-500 font-medium sticky bg-slate-50 z-10 border-r border-slate-200" style={{ left: CODE_W, minWidth: LABEL_W }}>HESAP ADI</th>
              {cols.map(col => (
                <th key={col.id} className="text-right px-3 py-2 min-w-[140px]">
                  <div className="text-[#0B3C5D] font-bold">{col.year}</div>
                  <div className="mt-1 flex justify-end">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#0B3C5D', color: '#fff' }}>
                      {PERIOD_LABEL_SHORT[col.period] ?? col.period}
                    </span>
                  </div>
                  {!hasAnyAccounts(col.id) && (
                    <div className="text-[8px] text-amber-600 mt-0.5">hesap kırılımı yok</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  )
}
