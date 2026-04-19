'use client'

import React, { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Plus, X, Loader2,
  BarChart3, Sliders, AlertTriangle, Trash2, CheckCircle,
  LayoutDashboard, Zap, TrendingUp,
} from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import { WhatIfSimulator } from '@/components/analysis/WhatIfSimulator'
import OptimizationPanel from '@/components/analysis/OptimizationPanel'
import TrendChart from '@/components/analysis/TrendChart'
import type { RatioResult } from '@/lib/scoring/ratios'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface Entity    { id: string; name: string; entityType: string; ownershipPct: number | null; sector: string | null }
interface Group     { id: string; name: string; baseCurrency: string; entities: Entity[] }
interface AllEntity { id: string; name: string; groupId: string | null }
interface PeriodInfo { year: number; period: string }

interface TenzilatEntry {
  id: string; adjustmentType: string; adjustmentAmount: number
  description: string; year: number; period: string; createdAt: string
}

interface Scoring {
  finalScore: number; finalRating: string
  liquidityScore: number; profitabilityScore: number
  leverageScore: number; activityScore: number
  // Subjektif birleşik skor (varsa)
  combinedScore?:       number
  combinedRating?:      string
  weightedSubjTotal?:   number
  hasSubjective?:       boolean
  subjectiveBreakdown?: Record<string, number>
}

interface ConsolidateResult {
  year: number; period: string
  consolidated: Record<string, number>
  tenzilatEntries: TenzilatEntry[]
  scoring: Scoring
  ratios?: RatioResult
  included: { id: string; name: string }[]
  missing:  { id: string; name: string }[]
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: 'PARENT',     label: 'Ana Şirket' },
  { value: 'SUBSIDIARY', label: 'Bağlı Ortaklık' },
  { value: 'JV',         label: 'Grup Şirketi' },
]

const TENZILAT_FIELDS: { group: string; fields: { value: string; label: string }[] }[] = [
  { group: 'Dönen Varlıklar', fields: [
    { value: 'cash',               label: 'Hazır Değerler' },
    { value: 'tradeReceivables',   label: 'Ticari Alacaklar' },
    { value: 'otherReceivables',   label: 'Diğer Alacaklar' },
    { value: 'inventory',          label: 'Stoklar' },
    { value: 'otherCurrentAssets', label: 'Diğer Dönen Varlıklar' },
    { value: 'totalCurrentAssets', label: 'Toplam Dönen Varlıklar' },
  ]},
  { group: 'Duran Varlıklar', fields: [
    { value: 'tangibleAssets',        label: 'Maddi Duran Varlıklar' },
    { value: 'intangibleAssets',      label: 'Maddi Olmayan Duran Varlıklar' },
    { value: 'totalNonCurrentAssets', label: 'Toplam Duran Varlıklar' },
    { value: 'totalAssets',           label: 'Toplam Aktif' },
  ]},
  { group: 'KV Borçlar', fields: [
    { value: 'shortTermFinancialDebt',  label: 'KV Mali Borçlar' },
    { value: 'tradePayables',           label: 'Ticari Borçlar' },
    { value: 'otherShortTermPayables',  label: 'Diğer KV Borçlar' },
    { value: 'totalCurrentLiabilities', label: 'Toplam KV Borçlar' },
  ]},
  { group: 'UV Borçlar', fields: [
    { value: 'longTermFinancialDebt',      label: 'UV Mali Borçlar' },
    { value: 'totalNonCurrentLiabilities', label: 'Toplam UV Borçlar' },
  ]},
  { group: 'Öz Kaynaklar', fields: [
    { value: 'paidInCapital',              label: 'Ödenmiş Sermaye' },
    { value: 'retainedEarnings',           label: 'Geçmiş Yıl Karları' },
    { value: 'netProfitCurrentYear',       label: 'Dönem Net Karı' },
    { value: 'totalEquity',                label: 'Toplam Öz Kaynak' },
    { value: 'totalLiabilitiesAndEquity',  label: 'Toplam Pasif' },
  ]},
  { group: 'Gelir Tablosu', fields: [
    { value: 'revenue',           label: 'Net Satışlar' },
    { value: 'cogs',              label: 'Satışların Maliyeti' },
    { value: 'grossProfit',       label: 'Brüt Kar' },
    { value: 'operatingExpenses', label: 'Faaliyet Giderleri' },
    { value: 'ebit',              label: 'FVÖK (EBIT)' },
    { value: 'otherIncome',       label: 'Diğer Olağan Gelirler' },
    { value: 'otherExpense',      label: 'Diğer Olağan Giderler' },
    { value: 'interestExpense',   label: 'Finansman Giderleri' },
    { value: 'netProfit',         label: 'Dönem Net Kar/Zarar' },
  ]},
]

const ALL_FIELD_LABELS = Object.fromEntries(
  TENZILAT_FIELDS.flatMap((g) => g.fields.map((f) => [f.value, f.label]))
)

const RATING_LABEL: Record<string, string> = {
  AAA: 'Mükemmel', AA: 'Yüksek', A: 'İyi', BBB: 'Yeterli',
  BB: 'Spekülatif', B: 'Riskli', CCC: 'Çok Riskli', CC: 'Kritik', C: 'Kritik', D: 'Temerrüt',
}

// ─── Tablo satır tanımları ─────────────────────────────────────────────────────

type RowVariant = 'normal' | 'bold' | 'grand' | 'diff'

type TableRowDef =
  | { type: 'section';   label: string }
  | { type: 'separator' }
  | { type: 'data'; label: string; field: string; variant?: RowVariant }

const TABLE_ROWS: TableRowDef[] = [
  // ── AKTİF ──────────────────────────────────────────────────────────────────
  { type: 'section',   label: 'AKTİF' },
  { type: 'data',      label: 'Hazır Değerler',              field: 'cash' },
  { type: 'data',      label: 'Ticari Alacaklar',            field: 'tradeReceivables' },
  { type: 'data',      label: 'Diğer Alacaklar',             field: 'otherReceivables' },
  { type: 'data',      label: 'Stoklar',                     field: 'inventory' },
  { type: 'data',      label: 'Verilen Sipariş Avansları',   field: 'prepaidSuppliers' },
  { type: 'data',      label: 'Diğer Dönen Varlıklar',       field: 'otherCurrentAssets' },
  { type: 'data',      label: 'DÖNEN VARLIK TOPLAMI',        field: 'totalCurrentAssets',     variant: 'bold' },
  { type: 'separator' },
  { type: 'data',      label: 'Maddi Duran Varlıklar',       field: 'tangibleAssets' },
  { type: 'data',      label: 'Maddi Olmayan Duran Varlıklar', field: 'intangibleAssets' },
  { type: 'data',      label: 'Gelecek Yıllara Ait Giderler', field: 'longTermPrepaidExpenses' },
  { type: 'data',      label: 'DURAN VARLIK TOPLAMI',        field: 'totalNonCurrentAssets',  variant: 'bold' },
  { type: 'separator' },
  { type: 'data',      label: 'AKTİF TOPLAM',                field: 'totalAssets',            variant: 'grand' },

  // ── PASİF ──────────────────────────────────────────────────────────────────
  { type: 'section',   label: 'PASİF' },
  { type: 'data',      label: 'KV Mali Borçlar',             field: 'shortTermFinancialDebt' },
  { type: 'data',      label: 'Ticari Borçlar',              field: 'tradePayables' },
  { type: 'data',      label: 'Diğer KV Borçlar',            field: 'otherShortTermPayables' },
  { type: 'data',      label: 'Alınan Avanslar',             field: 'advancesReceived' },
  { type: 'data',      label: 'Ödenecek Vergi ve Fonlar',    field: 'taxPayables' },
  { type: 'data',      label: 'KV YABANCI KAYNAK TOPLAMI',   field: 'totalCurrentLiabilities', variant: 'bold' },
  { type: 'separator' },
  { type: 'data',      label: 'UV Mali Borçlar',             field: 'longTermFinancialDebt' },
  { type: 'data',      label: 'UV YABANCI KAYNAK TOPLAMI',   field: 'totalNonCurrentLiabilities', variant: 'bold' },
  { type: 'separator' },
  { type: 'data',      label: 'Ödenmiş Sermaye',             field: 'paidInCapital' },
  { type: 'data',      label: 'Sermaye Yedekleri',           field: 'capitalReserves' },
  { type: 'data',      label: 'Geçmiş Yıl Karları',          field: 'retainedEarnings' },
  { type: 'data',      label: 'Geçmiş Yıl Zararları (-)',    field: '__retainedLosses__' },
  { type: 'data',      label: 'Dönem Net Kar / Zarar',       field: 'netProfitCurrentYear' },
  { type: 'data',      label: 'ÖZKAYNAKLAR TOPLAMI',         field: 'totalEquity',            variant: 'bold' },
  { type: 'separator' },
  { type: 'data',      label: 'PASİF TOPLAM',                field: 'totalLiabilitiesAndEquity', variant: 'grand' },
  { type: 'data',      label: 'AKTİF — PASİF FARKI',         field: '__diff__',               variant: 'diff' },

  // ── GELİR TABLOSU ──────────────────────────────────────────────────────────
  { type: 'section',   label: 'GELİR TABLOSU' },
  { type: 'data',      label: 'Net Satışlar',                field: 'revenue' },
  { type: 'data',      label: 'Satışların Maliyeti (-)',      field: 'cogs' },
  { type: 'data',      label: 'BRÜT KAR / ZARAR',            field: 'grossProfit',            variant: 'bold' },
  { type: 'data',      label: 'Faaliyet Giderleri (-)',       field: 'operatingExpenses' },
  { type: 'data',      label: 'FVÖK (EBIT)',                  field: 'ebit',                  variant: 'bold' },
  { type: 'data',      label: 'Diğer Olağan Gelirler',        field: 'otherIncome' },
  { type: 'data',      label: 'Diğer Olağan Giderler (-)',    field: 'otherExpense' },
  { type: 'data',      label: 'Finansman Giderleri (-)',      field: 'interestExpense' },
  { type: 'data',      label: 'OLAĞAN KAR / ZARAR',           field: '__olağanKar__',          variant: 'bold' },
  { type: 'data',      label: 'Olağandışı Gelirler',          field: 'extraordinaryIncome' },
  { type: 'data',      label: 'Olağandışı Giderler (-)',       field: 'extraordinaryExpense' },
  { type: 'data',      label: 'DÖNEM NET KAR / ZARAR',        field: 'netProfit',              variant: 'grand' },
]

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function fmtTRY(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)
  return v < 0 ? `-${s}` : s
}

function periodLabel(p: PeriodInfo): string {
  return p.period === 'ANNUAL' ? String(p.year) : `${p.year}/${p.period}`
}

function periodKey(p: PeriodInfo): string { return `${p.year}_${p.period}` }

function getFieldValue(con: Record<string, number>, field: string): number | null {
  if (field === '__diff__') {
    return (con.totalAssets ?? 0) - (con.totalLiabilitiesAndEquity ?? 0)
  }
  if (field === '__olağanKar__') {
    return (con.ebit ?? 0) + (con.otherIncome ?? 0) - (con.otherExpense ?? 0) - (con.interestExpense ?? 0)
  }
  if (field === '__retainedLosses__') {
    return con.retainedLosses != null ? -Math.abs(con.retainedLosses) : null
  }
  const v = (con as Record<string, unknown>)[field]
  return typeof v === 'number' ? v : null
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function GrupDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [activeTab, setActiveTab] = useState<'sirketler' | 'konsolide' | 'tenzilat'>('sirketler')
  const [konsolideSubTab, setKonsolideSubTab] = useState<'ozet' | 'rasyolar' | 'senaryo' | 'optimizasyon' | 'trend'>('ozet')

  // Şirketler
  const [group, setGroup]     = useState<Group | null>(null)
  const [allEntities, setAll] = useState<AllEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [addId, setAddId]     = useState('')
  const [addType, setAddType] = useState('SUBSIDIARY')
  const [addOwn, setAddOwn]   = useState('100')
  const [adding, setAdding]   = useState(false)

  // Konsolide — çok dönemli
  const [availPeriods, setAvailPeriods]   = useState<PeriodInfo[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(false)
  const [loadingAll, setLoadingAll]       = useState(false)
  const [loadError, setLoadError]         = useState<string | null>(null)
  const [allConData, setAllConData]       = useState<Record<string, ConsolidateResult>>({})

  // Tenzilat
  const [tField, setTField]     = useState('')
  const [tAmount, setTAmount]   = useState('')
  const [tDesc, setTDesc]       = useState('')
  const [tYear, setTYear]       = useState(new Date().getFullYear())
  const [tPeriod, setTPeriod]   = useState('ANNUAL')
  const [tenzilat, setTenzilat] = useState<TenzilatEntry[]>([])
  const [savingT, setSavingT]   = useState(false)

  // ── Yükle ──────────────────────────────────────────────────────────────────
  const loadGroup = useCallback(async () => {
    const [gr, en] = await Promise.all([
      fetch(`/api/groups/${id}`).then((r) => r.json()),
      fetch('/api/entities').then((r) => r.json()),
    ])
    setGroup(gr.group)
    setAll(en.entities ?? [])
    setLoading(false)
  }, [id])

  const loadTenzilat = useCallback(async () => {
    const res = await fetch(`/api/groups/${id}/tenzilat`)
    const d   = await res.json()
    setTenzilat(d.entries ?? [])
  }, [id])

  useEffect(() => { loadGroup(); loadTenzilat() }, [loadGroup, loadTenzilat])

  // ── Konsolide: tüm dönemleri yükle ────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'konsolide') return
    if (availPeriods.length > 0) return // zaten yüklü

    let cancelled = false

    async function load() {
      setLoadingPeriods(true)
      setLoadError(null)
      try {
        const res     = await fetch(`/api/groups/${id}/periods`)
        const d       = await res.json()
        const periods: PeriodInfo[] = d.periods ?? []
        if (cancelled) return
        setAvailPeriods(periods)
        setLoadingPeriods(false)

        if (periods.length === 0) return

        setLoadingAll(true)
        const results = await Promise.all(
          periods.map((p) =>
            fetch(`/api/groups/${id}/consolidate?year=${p.year}&period=${p.period}`)
              .then((r) => r.json())
              .catch(() => null)
          )
        )
        if (cancelled) return

        const dataMap: Record<string, ConsolidateResult> = {}
        for (let i = 0; i < periods.length; i++) {
          const data = results[i]
          if (data && !data.error) dataMap[periodKey(periods[i])] = data
        }
        setAllConData(dataMap)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Veri alınamadı.')
      } finally {
        if (!cancelled) { setLoadingPeriods(false); setLoadingAll(false) }
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id])

  // ── Dönem verisini yenile ──────────────────────────────────────────────────
  async function refreshConPeriod(year: number, period: string) {
    const key = `${year}_${period}`
    const res = await fetch(`/api/groups/${id}/consolidate?year=${year}&period=${period}`)
    const d   = await res.json()
    if (!d.error) setAllConData((prev) => ({ ...prev, [key]: d }))
  }

  // ── Şirket işlemleri ───────────────────────────────────────────────────────
  const available = allEntities.filter(
    (e) => !e.groupId && !group?.entities.some((ge) => ge.id === e.id)
  )

  async function addEntity() {
    if (!addId) return
    setAdding(true)
    const res = await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addEntityId: addId, entityType: addType, ownershipPct: Number(addOwn) / 100 }),
    })
    const d = await res.json()
    if (res.ok) setGroup(d.group)
    setAddId('')
    setAdding(false)
  }

  async function removeEntity(entityId: string) {
    await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeEntityId: entityId }),
    })
    setGroup((prev) => prev ? { ...prev, entities: prev.entities.filter((e) => e.id !== entityId) } : prev)
  }

  // ── Tenzilat işlemleri ─────────────────────────────────────────────────────
  async function addTenzilat() {
    if (!tField || !tAmount || !tDesc) return
    setSavingT(true)
    const res = await fetch(`/api/groups/${id}/tenzilat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: tField, amount: Number(tAmount), description: tDesc, year: tYear, period: tPeriod }),
    })
    const d = await res.json()
    if (res.ok) {
      setTenzilat((prev) => [d.entry, ...prev])
      setTField(''); setTAmount(''); setTDesc('')
      await refreshConPeriod(tYear, tPeriod)
    }
    setSavingT(false)
  }

  async function deleteTenzilat(entryId: string) {
    const entry = tenzilat.find((e) => e.id === entryId)
    await fetch(`/api/groups/${id}/tenzilat/${entryId}`, { method: 'DELETE' })
    setTenzilat((prev) => prev.filter((e) => e.id !== entryId))
    if (entry) await refreshConPeriod(entry.year, entry.period)
  }

  // ── Dönem sütun düzeni: eskiden yeniye (soldan sağa) ──────────────────────
  // availPeriods: [en yeni, ..., en eski] → reverse → [en eski, ..., en yeni]
  const displayPeriods = [...availPeriods].reverse()
  const latestKey = availPeriods.length > 0 ? periodKey(availPeriods[0]) : null

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <DashboardShell>
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin" style={{ color: '#2EC4B6' }} />
      </div>
    </DashboardShell>
  )
  if (!group) return (
    <DashboardShell>
      <p style={{ color: '#94A3B8' }}>Grup bulunamadı.</p>
    </DashboardShell>
  )

  return (
    <DashboardShell>
    <div className="space-y-6">

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/gruplar" className="text-gray-400 hover:text-[#0B3C5D] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#0B3C5D]">{group.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{group.entities.length} şirket · {group.baseCurrency}</p>
        </div>
      </div>

      {/* Ana sekmeler */}
      <div className="tab-group inline-flex">
        {([
          { key: 'sirketler', label: 'Şirketler', Icon: Building2 },
          { key: 'konsolide', label: 'Konsolide', Icon: BarChart3  },
          { key: 'tenzilat',  label: 'Tenzilat',  Icon: Sliders   },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`tab flex items-center gap-1.5 px-4 py-2 text-sm${activeTab === key ? ' active' : ''}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          ŞİRKETLER SEKMESİ
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'sirketler' && (
        <div className="max-w-2xl space-y-4">
          {available.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-head"><h2 className="card-title text-sm">Şirket Ekle</h2></div>
              <div className="card-body">
                <div className="flex flex-wrap gap-3">
                  <select value={addId} onChange={(e) => setAddId(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    <option value="">— Şirket seçin —</option>
                    {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <select value={addType} onChange={(e) => setAddType(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    {ENTITY_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" value={addOwn} onChange={(e) => setAddOwn(e.target.value)}
                      min={1} max={100}
                      className="w-16 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500" />
                    <span className="text-gray-400 text-sm">%</span>
                  </div>
                  <button onClick={addEntity} disabled={!addId || adding}
                    className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ekle
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="card-head"><h2 className="card-title text-sm">Grup Şirketleri</h2></div>
            {group.entities.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 size={28} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>Gruba henüz şirket eklenmedi.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5E9F0]">
                {group.entities.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <Building2 size={15} style={{ color: '#2EC4B6', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/dashboard/sirketler/${e.id}`}
                        className="text-sm font-medium text-[#0B3C5D] hover:underline">{e.name}</Link>
                      {e.sector && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{e.sector}</p>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#F1F5F9', color: '#64748B' }}>
                      {e.entityType === 'PARENT' ? 'Ana' : e.entityType === 'JV' ? 'GŞ' : 'Bağlı'}
                    </span>
                    {e.ownershipPct != null && (
                      <span className="text-xs font-medium" style={{ color: '#2EC4B6' }}>
                        %{(Number(e.ownershipPct) * 100).toFixed(0)}
                      </span>
                    )}
                    <button onClick={() => removeEntity(e.id)}
                      className="p-1 rounded hover:bg-red-50 transition-colors" style={{ color: '#CBD5E1' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#CBD5E1')}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          KONSOLİDE SEKMESİ
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'konsolide' && (
        <div className="space-y-4">

          {/* Alt sekme navigasyonu — sadece veri varsa göster */}
          {Object.keys(allConData).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'ozet',         label: 'Özet',         Icon: LayoutDashboard },
                { key: 'rasyolar',     label: 'Rasyolar',     Icon: BarChart3       },
                { key: 'senaryo',      label: 'Senaryo',      Icon: Sliders         },
                { key: 'optimizasyon', label: 'Optimizasyon', Icon: Zap             },
                { key: 'trend',        label: 'Trend',        Icon: TrendingUp      },
              ] as const).map(({ key, label, Icon }) => {
                const isActive = konsolideSubTab === key
                return (
                  <button
                    key={key}
                    onClick={() => setKonsolideSubTab(key)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px',
                      borderRadius: 8,
                      fontSize: 11, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      background: isActive ? '#0B3C5D' : '#F1F5F9',
                      color: isActive ? '#ffffff' : '#64748B',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    <Icon size={12} />
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Yükleniyor */}
          {(loadingPeriods || loadingAll) && (
            <div className="flex items-center justify-center py-16 gap-3" style={{ color: '#94A3B8' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: '#2EC4B6' }} />
              <span className="text-sm">
                {loadingPeriods ? 'Dönemler yükleniyor…' : 'Konsolide hesaplanıyor…'}
              </span>
            </div>
          )}

          {/* Hata */}
          {loadError && !loadingPeriods && !loadingAll && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertTriangle size={15} style={{ color: '#EF4444', flexShrink: 0 }} />
              <span className="text-sm" style={{ color: '#DC2626' }}>{loadError}</span>
            </div>
          )}

          {/* Boş — veri yok */}
          {!loadingPeriods && !loadingAll && !loadError && availPeriods.length === 0 && (
            <div className="card p-10 text-center">
              <BarChart3 size={32} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>Bu grubun hiçbir şirketine henüz finansal veri yüklenmemiş.</p>
            </div>
          )}

          {/* Ana içerik */}
          {!loadingPeriods && !loadingAll && availPeriods.length > 0 && (
            <>
              {/* ── ÖZET alt sekmesi ─────────────────────────────────────── */}
              {konsolideSubTab === 'ozet' && (
                <>
                  {/* Tenzilat banner */}
                  {tenzilat.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                      style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <AlertTriangle size={14} style={{ color: '#D97706' }} />
                      <p className="text-xs" style={{ color: '#92400E' }}>
                        Bu grup için henüz tenzilat girilmedi. Tablolar ham konsolide toplamını gösteriyor.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                      style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                      <CheckCircle size={14} style={{ color: '#16a34a' }} />
                      <p className="text-xs" style={{ color: '#166534' }}>
                        {tenzilat.length} tenzilat kaydı uygulandı ·{' '}
                        Toplam: <strong>-{fmtTRY(tenzilat.reduce((s, e) => s + e.adjustmentAmount, 0))} TL</strong>
                      </p>
                    </div>
                  )}

                  {/* Eksik veri uyarısı — herhangi bir dönem için */}
                  {Object.values(allConData).some((d) => d.missing.length > 0) && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-xl"
                      style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs" style={{ color: '#B45309' }}>
                        Bazı dönemler için eksik şirket verisi mevcut — ilgili sütunlar kısmi toplamı gösteriyor.
                      </p>
                    </div>
                  )}

                  {/* ── ANA TABLO ────────────────────────────────────────────── */}
                  <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <colgroup>
                          <col style={{ minWidth: 220 }} />
                          {displayPeriods.map((p) => (
                            <col key={periodKey(p)} style={{ minWidth: 130 }} />
                          ))}
                        </colgroup>

                        {/* Tablo başlığı */}
                        <thead>
                          <tr>
                            <th style={{
                              padding: '10px 16px', textAlign: 'left', fontSize: 11,
                              fontWeight: 600, color: '#94A3B8', background: '#F8FAFC',
                              borderBottom: '2px solid #E5E9F0', position: 'sticky', left: 0, zIndex: 2,
                            }}>
                              KALEM
                            </th>
                            {displayPeriods.map((p) => {
                              const isLatest = periodKey(p) === latestKey
                              return (
                                <th key={periodKey(p)} style={{
                                  padding: '10px 16px', textAlign: 'right', fontSize: 12,
                                  fontWeight: 700, letterSpacing: '0.01em',
                                  background: isLatest ? '#0B3C5D' : '#F8FAFC',
                                  color:      isLatest ? '#ffffff' : '#64748B',
                                  borderBottom: '2px solid #E5E9F0',
                                  borderLeft: '1px solid #E5E9F0',
                                }}>
                                  {periodLabel(p)}
                                </th>
                              )
                            })}
                          </tr>
                        </thead>

                        {/* Gövde */}
                        <tbody>
                          {TABLE_ROWS.map((row, rowIdx) => {

                            // ── Section header ──────────────────────────────────
                            if (row.type === 'section') {
                              return (
                                <tr key={rowIdx}>
                                  <td colSpan={displayPeriods.length + 1} style={{
                                    padding: '10px 16px 6px',
                                    background: '#F1F5F9',
                                    fontSize: 10, fontWeight: 700,
                                    letterSpacing: '0.08em', textTransform: 'uppercase',
                                    color: '#64748B',
                                    borderTop: rowIdx > 0 ? '2px solid #E5E9F0' : undefined,
                                    borderBottom: '1px solid #E5E9F0',
                                  }}>
                                    {row.label}
                                  </td>
                                </tr>
                              )
                            }

                            // ── Separator ───────────────────────────────────────
                            if (row.type === 'separator') {
                              return (
                                <tr key={rowIdx}>
                                  <td colSpan={displayPeriods.length + 1}
                                    style={{ height: 6, background: '#F8FAFC', padding: 0 }} />
                                </tr>
                              )
                            }

                            // ── Data row ────────────────────────────────────────
                            const variant = row.variant ?? 'normal'
                            const isBold  = variant === 'bold'
                            const isGrand = variant === 'grand'
                            const isDiff  = variant === 'diff'
                            const isEmphasized = isBold || isGrand || isDiff

                            const rowBg = isGrand ? '#EDF4F8' : isBold ? '#F8FAFC' : '#ffffff'
                            const labelColor = isEmphasized ? '#0B3C5D' : '#1E293B'
                            const labelSize  = isGrand ? 13 : 12
                            const labelWeight = isGrand ? 800 : isBold ? 700 : isDiff ? 600 : 400
                            const rowPadding = isGrand ? '10px 16px' : isBold ? '8px 16px' : '6px 16px'
                            const borderTop = (isBold || isGrand) ? '1px solid #CBD5E1' : undefined
                            const borderBottom = isDiff ? 'none' : '1px solid #F1F5F9'

                            return (
                              <tr key={rowIdx} style={{ background: rowBg }}>
                                {/* Kalem adı — sticky */}
                                <td style={{
                                  padding: rowPadding,
                                  fontSize: labelSize, fontWeight: labelWeight, color: labelColor,
                                  borderTop, borderBottom,
                                  position: 'sticky', left: 0, background: rowBg, zIndex: 1,
                                }}>
                                  {row.label}
                                </td>

                                {/* Değer hücreleri */}
                                {displayPeriods.map((p) => {
                                  const pkey   = periodKey(p)
                                  const result = allConData[pkey]
                                  const con    = result?.consolidated ?? {}
                                  const value  = result ? getFieldValue(con, row.field) : null

                                  // Değer rengi
                                  let valueColor = labelColor
                                  if (isDiff && value != null) {
                                    valueColor = Math.abs(value) < 1 ? '#16a34a' : '#dc2626'
                                  } else if (!isEmphasized && value != null && value < 0) {
                                    valueColor = '#dc2626'
                                  } else if (isEmphasized) {
                                    valueColor = '#0B3C5D'
                                  }

                                  // diff için ✓/✗
                                  const diffSuffix = isDiff && value != null
                                    ? (Math.abs(value) < 1 ? ' ✓' : '')
                                    : ''

                                  return (
                                    <td key={pkey} style={{
                                      padding: rowPadding,
                                      textAlign: 'right',
                                      fontSize: labelSize, fontWeight: labelWeight,
                                      color: valueColor,
                                      fontVariantNumeric: 'tabular-nums',
                                      borderTop, borderBottom,
                                      borderLeft: '1px solid #F1F5F9',
                                    }}>
                                      {value == null ? (result ? '—' : '') : `${fmtTRY(value)}${diffSuffix}`}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── KONSOLİDE SKOR KARTI ─────────────────────────────────── */}
                  <div className="card overflow-hidden">
                    <div className="card-head" style={{ background: '#F8FAFC' }}>
                      <div>
                        <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                          KONSOLİDE SKOR
                        </h2>
                        <p className="text-[10px] mt-0.5" style={{ color: '#94A3B8' }}>
                          Konsolide finansal veriden hesaplanmıştır · {tenzilat.length === 0 ? 'Tenzilat uygulanmadı' : 'Tenzilat uygulandı'}
                        </p>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="flex flex-wrap gap-3">
                        {displayPeriods.map((p) => {
                          const pkey   = periodKey(p)
                          const scoring = allConData[pkey]?.scoring
                          const isLatest = pkey === latestKey
                          if (!scoring) return null
                          // Subjektif girilmişse birleşik skoru göster, yoksa saf finansali
                          const displayScore  = scoring.hasSubjective && scoring.combinedScore  != null ? scoring.combinedScore  : scoring.finalScore
                          const displayRating = scoring.hasSubjective && scoring.combinedRating != null ? scoring.combinedRating : scoring.finalRating
                          return (
                            <div key={pkey} className="flex-1 text-center rounded-xl p-4"
                              style={{
                                minWidth: 110,
                                background: isLatest ? '#EDF4F8' : '#F8FAFC',
                                border: `1px solid ${isLatest ? 'rgba(11,60,93,0.18)' : '#E5E9F0'}`,
                              }}>
                              <p className="text-xs font-semibold mb-2" style={{ color: isLatest ? '#0B3C5D' : '#64748B' }}>
                                {periodLabel(p)}
                              </p>
                              <p style={{
                                fontSize: isLatest ? 40 : 32, fontWeight: 900,
                                fontFamily: 'Outfit, sans-serif', color: '#0B3C5D', lineHeight: 1,
                              }}>
                                {Math.round(displayScore)}
                              </p>
                              <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>/100</p>
                              <div className="inline-flex px-2.5 py-0.5 rounded-lg mt-2 text-xs font-bold"
                                style={{
                                  background: isLatest ? '#0B3C5D' : '#E2EAF0',
                                  color:      isLatest ? '#ffffff'  : '#0B3C5D',
                                }}>
                                {displayRating}
                              </div>
                              <p style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
                                {RATING_LABEL[displayRating] ?? '—'}
                              </p>
                              {scoring.hasSubjective && scoring.weightedSubjTotal != null && (
                                <p style={{ fontSize: 9, color: '#2EC4B6', marginTop: 4 }}>
                                  +{scoring.weightedSubjTotal.toFixed(1)} subj.
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── RASYOLAR alt sekmesi ──────────────────────────────────── */}
              {konsolideSubTab === 'rasyolar' && (
                <>
                  {latestKey && allConData[latestKey] ? (() => {
                    const ratios = allConData[latestKey].ratios
                    // Grubun PARENT şirketinin sektörünü bul; yoksa ilk şirketin sektörü
                    const parentSector = group?.entities.find(e => e.entityType === 'PARENT')?.sector
                      ?? group?.entities[0]?.sector ?? null
                    const bm = parentSector ? getSectorBenchmark(parentSector) : null

                    type RatioRow = { key: keyof RatioResult; label: string; lowerIsBetter?: boolean; isDays?: boolean; isPct?: boolean; bmKey?: string }
                    const RATIO_ROWS: RatioRow[] = [
                      // ── Likidite ────────────────────────────────────────
                      { key: 'currentRatio',            label: 'Cari Oran',                                   bmKey: 'currentRatio' },
                      { key: 'quickRatio',              label: 'Hızlı Oran',                                  bmKey: 'quickRatio' },
                      { key: 'cashRatio',               label: 'Nakit Oranı',                                 bmKey: 'cashRatio' },
                      { key: 'netWorkingCapitalRatio',  label: 'NÇS / Aktif',                                 bmKey: 'netWorkingCapitalRatio' },
                      { key: 'cashConversionCycle',     label: 'Nakit Dönüşüm Süresi (gün)', lowerIsBetter: true, isDays: true, bmKey: 'cashConversionCycle' },
                      // ── Karlılık ─────────────────────────────────────────
                      { key: 'ebitdaMargin',            label: 'FAVÖK Marjı',                    isPct: true,  bmKey: 'ebitdaMargin' },
                      { key: 'ebitMargin',              label: 'Faaliyet Kâr Marjı (EBIT)',       isPct: true,  bmKey: 'ebitMargin' },
                      { key: 'netProfitMargin',         label: 'Net Kâr Marjı',                  isPct: true,  bmKey: 'netProfitMargin' },
                      { key: 'grossMargin',             label: 'Brüt Kâr Marjı',                 isPct: true,  bmKey: 'grossMargin' },
                      { key: 'roa',                     label: 'Aktif Kârlılığı (ROA)',           isPct: true,  bmKey: 'roa' },
                      { key: 'roe',                     label: 'Özkaynak Kârlılığı (ROE)',        isPct: true,  bmKey: 'roe' },
                      { key: 'roic',                    label: 'Yatırım Getirisi (ROIC)',         isPct: true,  bmKey: 'roic' },
                      { key: 'revenueGrowth',           label: 'Ciro Büyümesi',                  isPct: true },
                      { key: 'realGrowth',              label: 'Reel Büyüme',                    isPct: true },
                      // ── Kaldıraç ─────────────────────────────────────────
                      { key: 'debtToEquity',            label: 'Borç / Özkaynak',      lowerIsBetter: true,    bmKey: 'debtToEquity' },
                      { key: 'debtToAssets',            label: 'Borç / Aktif',          lowerIsBetter: true,    bmKey: 'debtToAssets' },
                      { key: 'equityRatio',             label: 'Özkaynak Oranı',                               bmKey: 'equityRatio' },
                      { key: 'shortTermDebtRatio',      label: 'KV Borç / Top. Fin. Borç', lowerIsBetter: true, bmKey: 'shortTermDebtRatio' },
                      { key: 'interestCoverage',        label: 'Faiz Karşılama',                               bmKey: 'interestCoverage' },
                      { key: 'debtToEbitda',            label: 'Net Borç / FAVÖK',      lowerIsBetter: true,    bmKey: 'debtToEbitda' },
                      // ── Faaliyet ─────────────────────────────────────────
                      { key: 'assetTurnover',           label: 'Aktif Devir Hızı',                             bmKey: 'assetTurnover' },
                      { key: 'inventoryTurnoverDays',   label: 'Stok Devir Süresi (gün)',   lowerIsBetter: true, isDays: true, bmKey: 'inventoryDays' },
                      { key: 'receivablesTurnoverDays', label: 'Alacak Tahsil Süresi (gün)',lowerIsBetter: true, isDays: true, bmKey: 'receivablesDays' },
                      { key: 'payablesTurnoverDays',    label: 'Borç Ödeme Süresi (gün)',                      isDays: true, bmKey: 'payablesTurnoverDays' },
                      { key: 'fixedAssetTurnover',      label: 'Duran Varlık Devir Hızı',                      bmKey: 'fixedAssetTurnover' },
                      { key: 'operatingExpenseRatio',   label: 'Faaliyet Gideri Oranı',    lowerIsBetter: true, isPct: true, bmKey: 'operatingExpenseRatio' },
                    ]

                    function fmtRatio(val: number | null, isPct?: boolean, isDays?: boolean): string {
                      if (val == null) return '—'
                      if (val >= 9998) return '∞'
                      if (isDays) return `${Math.round(val)} gün`
                      if (isPct) return `%${(val * 100).toFixed(1)}`
                      return val.toFixed(2)
                    }

                    // Sektör benchmark ile karşılaştır; yoksa basit pozitif/negatif
                    function getRatioStatus(val: number | null, bmVal: number | null | undefined, lowerIsBetter?: boolean): { dot: string; label: string } {
                      if (val == null) return { dot: '#CBD5E1', label: '—' }
                      if (bmVal != null && bmVal !== 0) {
                        const ratio = lowerIsBetter ? bmVal / val : val / bmVal
                        if (ratio >= 1.2)  return { dot: '#16a34a', label: 'Sektör üstü' }
                        if (ratio >= 0.85) return { dot: '#2EC4B6', label: 'Sektör ortası' }
                        if (ratio >= 0.5)  return { dot: '#D97706', label: 'Sektör altı' }
                        return { dot: '#DC2626', label: 'Zayıf' }
                      }
                      // Sektör benchmarkı yoksa
                      if (lowerIsBetter) return val <= 0 ? { dot: '#16a34a', label: 'İyi' } : { dot: '#94A3B8', label: 'Değer' }
                      return val > 0 ? { dot: '#16a34a', label: 'Pozitif' } : { dot: '#DC2626', label: 'Negatif' }
                    }

                    const SECTION_LABELS: Record<string, string> = {
                      currentRatio: 'LİKİDİTE', ebitdaMargin: 'KARLILIK',
                      debtToEquity: 'BORÇLULUK', assetTurnover: 'FAALİYET',
                    }

                    return (
                      <div className="card overflow-hidden">
                        <div className="card-head" style={{ background: '#F8FAFC', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                            25 FİNANSAL ORAN — Son Dönem
                          </h2>
                          <p style={{ fontSize: 11, color: '#64748B' }}>
                            {bm
                              ? <>Karşılaştırma: <strong style={{ color: '#0B3C5D' }}>{parentSector}</strong> sektörü benchmarkı</>
                              : 'Sektör benchmarkı yok — gruba sektör atayın'}
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E5E9F0' }}>
                                <th style={{ padding: '8px 16px', textAlign: 'left',   fontSize: 11, fontWeight: 600, color: '#94A3B8', minWidth: 220 }}>RASYO</th>
                                <th style={{ padding: '8px 16px', textAlign: 'right',  fontSize: 11, fontWeight: 600, color: '#94A3B8', minWidth: 90 }}>DEĞER</th>
                                <th style={{ padding: '8px 16px', textAlign: 'right',  fontSize: 11, fontWeight: 600, color: '#94A3B8', minWidth: 90 }}>SEKTÖR ORT.</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#94A3B8', minWidth: 120 }}>DURUM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {RATIO_ROWS.map(({ key, label, lowerIsBetter, isDays, isPct, bmKey }) => {
                                const val   = ratios ? ratios[key as keyof typeof ratios] as number | null : null
                                const bmVal = (bm && bmKey) ? ((bm as unknown as Record<string, number | null>)[bmKey] ?? null) : null
                                const { dot, label: statusLabel } = getRatioStatus(val, bmVal, lowerIsBetter)
                                const sectionHeader = SECTION_LABELS[key]
                                return (
                                  <React.Fragment key={key}>
                                    {sectionHeader && (
                                      <tr>
                                        <td colSpan={4} style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748B', background: '#F1F5F9' }}>
                                          {sectionHeader}
                                        </td>
                                      </tr>
                                    )}
                                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                                      <td style={{ padding: '7px 16px', color: '#1E293B', fontSize: 12 }}>{label}</td>
                                      <td style={{ padding: '7px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#0B3C5D', fontSize: 12 }}>
                                        {fmtRatio(val, isPct, isDays)}
                                      </td>
                                      <td style={{ padding: '7px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#94A3B8', fontSize: 11 }}>
                                        {bmVal != null ? fmtRatio(bmVal, isPct, isDays) : '—'}
                                      </td>
                                      <td style={{ padding: '7px 16px', textAlign: 'center' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />
                                          <span style={{ fontSize: 11, color: dot }}>{val != null ? statusLabel : '—'}</span>
                                        </span>
                                      </td>
                                    </tr>
                                  </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })() : (
                    <div className="card p-8 text-center">
                      <p className="text-sm" style={{ color: '#94A3B8' }}>Konsolide veri yok.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── SENARYO alt sekmesi ───────────────────────────────────── */}
              {konsolideSubTab === 'senaryo' && (
                <>
                  {latestKey && allConData[latestKey] ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                        style={{ background: '#EDF4F8', border: '1px solid rgba(11,60,93,0.12)' }}>
                        <Sliders size={13} style={{ color: '#0B3C5D', flexShrink: 0 }} />
                        <p className="text-xs" style={{ color: '#0B3C5D' }}>
                          Son dönem konsolide verisi üzerinden simülasyon yapılmaktadır.
                        </p>
                      </div>
                      <WhatIfSimulator
                        baseData={Object.fromEntries(Object.entries(allConData[latestKey]?.consolidated ?? {}).map(([k, v]) => [k, v]))}
                        baseScore={allConData[latestKey]?.scoring?.finalScore ?? 0}
                        rawFinancialData={allConData[latestKey]?.consolidated}
                      />
                    </div>
                  ) : (
                    <div className="card p-8 text-center">
                      <p className="text-sm" style={{ color: '#94A3B8' }}>Konsolide veri yok.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── OPTİMİZASYON alt sekmesi ─────────────────────────────── */}
              {konsolideSubTab === 'optimizasyon' && (
                <>
                  {latestKey && allConData[latestKey] ? (
                    <OptimizationPanel
                      ratios={allConData[latestKey]?.ratios as RatioResult}
                      currentScore={allConData[latestKey]?.scoring?.combinedScore ?? allConData[latestKey]?.scoring?.finalScore ?? 0}
                      currentRating={allConData[latestKey]?.scoring?.combinedRating ?? allConData[latestKey]?.scoring?.finalRating ?? 'D'}
                      sector={null}
                    />
                  ) : (
                    <div className="card p-8 text-center">
                      <p className="text-sm" style={{ color: '#94A3B8' }}>Konsolide veri yok.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── TREND alt sekmesi ─────────────────────────────────────── */}
              {konsolideSubTab === 'trend' && (
                <TrendChart
                  analyses={Object.entries(allConData).map(([key, result]) => ({
                    id: key,
                    year: result.year,
                    period: result.period,
                    finalScore: result.scoring?.combinedScore ?? result.scoring?.finalScore ?? 0,
                    finalRating: result.scoring?.combinedRating ?? result.scoring?.finalRating ?? 'D',
                    liquidityScore: result.scoring?.liquidityScore ?? 0,
                    profitabilityScore: result.scoring?.profitabilityScore ?? 0,
                    leverageScore: result.scoring?.leverageScore ?? 0,
                    activityScore: result.scoring?.activityScore ?? 0,
                  }))}
                  entityName={group?.name ?? 'Grup'}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TENZİLAT SEKMESİ
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'tenzilat' && (
        <div className="max-w-2xl space-y-5">
          {/* Form */}
          <div className="card overflow-hidden">
            <div className="card-head"><h2 className="card-title text-sm">Yeni Tenzilat Kalemi</h2></div>
            <div className="card-body space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Kalem</label>
                  <select value={tField} onChange={(e) => setTField(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    <option value="">— Kalem seçin —</option>
                    {TENZILAT_FIELDS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Tutar (düşülecek)</label>
                  <input type="number" value={tAmount} onChange={(e) => setTAmount(e.target.value)} placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Yıl</label>
                  <select value={tYear} onChange={(e) => setTYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map((y) =>
                      <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Dönem</label>
                  <select value={tPeriod} onChange={(e) => setTPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    {[{v:'ANNUAL',l:'Yıllık'},{v:'Q1',l:'Q1'},{v:'Q2',l:'Q2'},{v:'Q3',l:'Q3'},{v:'Q4',l:'Q4'}]
                      .map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Açıklama</label>
                <input type="text" value={tDesc} onChange={(e) => setTDesc(e.target.value)}
                  placeholder="Örn: Grup içi ticari alacak eliminasyonu"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] placeholder-gray-400 focus:outline-none focus:border-cyan-500" />
              </div>
              <div className="flex justify-end">
                <button onClick={addTenzilat} disabled={savingT || !tField || !tAmount || !tDesc}
                  className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                  {savingT ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ekle
                </button>
              </div>
            </div>
          </div>

          {/* Liste */}
          <div className="card overflow-hidden">
            <div className="card-head"><h2 className="card-title text-sm">Kayıtlar ({tenzilat.length})</h2></div>
            {tenzilat.length === 0 ? (
              <div className="p-8 text-center">
                <Sliders size={28} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz tenzilat kaydı eklenmedi.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5E9F0]">
                {tenzilat.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{ background: '#EDF4F8', color: '#0B3C5D' }}>
                          {ALL_FIELD_LABELS[e.adjustmentType] ?? e.adjustmentType}
                        </span>
                        <span className="text-xs" style={{ color: '#94A3B8' }}>{e.year} / {e.period}</span>
                      </div>
                      <p className="text-sm mt-1 text-[#1E293B]">{e.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: '#0B3C5D' }}>
                        -{fmtTRY(e.adjustmentAmount)}
                      </p>
                      <button onClick={() => deleteTenzilat(e.id)}
                        className="mt-1 p-1 rounded hover:bg-red-50 transition-colors" style={{ color: '#CBD5E1' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
    </DashboardShell>
  )
}
