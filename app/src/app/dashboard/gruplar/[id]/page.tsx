'use client'

import React, { useState, useEffect, use, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Plus, X, Loader2,
  AlertTriangle, BarChart3, Save, GitBranch, Sliders, TrendingDown,
} from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import { WhatIfSimulator } from '@/components/analysis/WhatIfSimulator'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'
import type { SectorBenchmark } from '@/lib/scoring/benchmarks'

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface GroupInfo {
  id:     string
  name:   string
  sector: string
}

interface EntityInfo {
  id:           string
  name:         string
  ownershipPct: number   // 0–100
  totalAssets:  number
  latestAnalysis: { finalScore: number; grade: string } | null
}

interface ConsolidatedResult {
  consolidatedScore:    number
  consolidatedGrade:    string
  weightedAverageScore: number
  weakestLinkApplied:   boolean
  liquidityScore:       number
  profitabilityScore:   number
  leverageScore:        number
  activityScore:        number
  eliminatedFinancials: Record<string, number | null>
  consolidatedRatios:   Record<string, number | null>
}

interface EliminationsData {
  intercompanySales:            number
  intercompanyPurchases:        number
  intercompanyReceivables:      number
  intercompanyPayables:         number
  intercompanyAdvancesGiven:    number
  intercompanyAdvancesReceived: number
  intercompanyProfit:           number
}

interface AllEntity { id: string; name: string; groupId: string | null }

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const ZERO_ELIM: EliminationsData = {
  intercompanySales:            0,
  intercompanyPurchases:        0,
  intercompanyReceivables:      0,
  intercompanyPayables:         0,
  intercompanyAdvancesGiven:    0,
  intercompanyAdvancesReceived: 0,
  intercompanyProfit:           0,
}

const ENTITY_TYPES = [
  { value: 'PARENT',     label: 'Ana Şirket' },
  { value: 'SUBSIDIARY', label: 'Bağlı Ortaklık' },
  { value: 'JV',         label: 'Grup Şirketi' },
]

const RATING_LABEL: Record<string, string> = {
  AAA: 'Mükemmel', AA: 'Yüksek', A: 'İyi', BBB: 'Yeterli',
  BB: 'Spekülatif', B: 'Riskli', CCC: 'Çok Riskli', CC: 'Kritik', C: 'Kritik', D: 'Temerrüt',
}

const ELIM_FIELDS: { key: keyof EliminationsData; label: string; hint: string }[] = [
  { key: 'intercompanySales',            label: 'Grup İçi Satışlar',             hint: 'Gelir tablosundan düşülür' },
  { key: 'intercompanyPurchases',        label: 'Grup İçi Alışlar',              hint: 'Satışların maliyetinden düşülür' },
  { key: 'intercompanyReceivables',      label: 'Grup İçi Ticari Alacaklar',     hint: 'Aktiften düşülür' },
  { key: 'intercompanyPayables',         label: 'Grup İçi Ticari Borçlar',       hint: 'Pasiften düşülür' },
  { key: 'intercompanyAdvancesGiven',    label: 'Verilen Grup İçi Avanslar',     hint: 'Aktiften düşülür' },
  { key: 'intercompanyAdvancesReceived', label: 'Alınan Grup İçi Avanslar',      hint: 'Pasiften düşülür' },
  { key: 'intercompanyProfit',           label: 'Grup İçi Gerçekleşmemiş Kâr',  hint: 'Stok/aktif ve özkaynak düşülür' },
]

// ── 25-rasyo meta verisi — benchmark eşleştirmesi, yön ve ağırlık ──────────────
// direction: 'higher' → büyük olmalı | 'lower' → küçük olmalı | 'none' → karşılaştırma yok
// catWeight: kategori'nin nihai skordaki ağırlığı (%) / kategori içi rasyo sayısı
type RatioDir = 'higher' | 'lower' | 'none'
interface RatioMeta {
  key:       string
  label:     string
  bmKey:     keyof SectorBenchmark | null
  direction: RatioDir
  catWeight: number   // tahmini ağırlık (% final score)
}
interface RatioGroup {
  label:  string
  color:  string
  ratios: RatioMeta[]
}

const RATIO_GROUPS: RatioGroup[] = [
  {
    label: 'Likidite', color: '#2EC4B6',
    ratios: [
      { key: 'currentRatio',           label: 'Cari Oran',              bmKey: 'currentRatio',          direction: 'higher', catWeight: 25/5 },
      { key: 'quickRatio',             label: 'Asit-Test Oranı',        bmKey: 'quickRatio',            direction: 'higher', catWeight: 25/5 },
      { key: 'cashRatio',              label: 'Nakit Oranı',            bmKey: 'cashRatio',             direction: 'higher', catWeight: 25/5 },
      { key: 'netWorkingCapital',      label: 'Net İşletme Sermayesi',  bmKey: null,                    direction: 'none',   catWeight: 0 },
      { key: 'netWorkingCapitalRatio', label: 'NİS Oranı',              bmKey: 'netWorkingCapitalRatio',direction: 'higher', catWeight: 25/5 },
      { key: 'cashConversionCycle',    label: 'Nakit Döngüsü (gün)',    bmKey: 'cashConversionCycle',   direction: 'lower',  catWeight: 25/5 },
    ],
  },
  {
    label: 'Kârlılık', color: '#0B3C5D',
    ratios: [
      { key: 'grossMargin',     label: 'Brüt Kâr Marjı',  bmKey: 'grossMargin',     direction: 'higher', catWeight: 30/7 },
      { key: 'ebitdaMargin',    label: 'FAVÖK Marjı',      bmKey: 'ebitdaMargin',    direction: 'higher', catWeight: 30/7 },
      { key: 'ebitMargin',      label: 'FVÖK Marjı',       bmKey: 'ebitMargin',      direction: 'higher', catWeight: 30/7 },
      { key: 'netProfitMargin', label: 'Net Kâr Marjı',    bmKey: 'netProfitMargin', direction: 'higher', catWeight: 30/7 },
      { key: 'roa',             label: 'ROA',              bmKey: 'roa',             direction: 'higher', catWeight: 30/7 },
      { key: 'roe',             label: 'ROE',              bmKey: 'roe',             direction: 'higher', catWeight: 30/7 },
      { key: 'roic',            label: 'ROIC',             bmKey: 'roic',            direction: 'higher', catWeight: 30/7 },
      { key: 'revenueGrowth',   label: 'Ciro Büyümesi',    bmKey: 'revenueGrowth',   direction: 'higher', catWeight: 30/7 },
      { key: 'realGrowth',      label: 'Reel Büyüme',      bmKey: null,              direction: 'none',   catWeight: 0 },
    ],
  },
  {
    label: 'Kaldıraç', color: '#D97706',
    ratios: [
      { key: 'debtToEquity',       label: 'Borç / Özkaynak',  bmKey: 'debtToEquity',       direction: 'lower',  catWeight: 30/5 },
      { key: 'debtToAssets',       label: 'Borç / Aktif',     bmKey: 'debtToAssets',       direction: 'lower',  catWeight: 30/5 },
      { key: 'debtToEbitda',       label: 'Net Borç / FAVÖK', bmKey: 'debtToEbitda',       direction: 'lower',  catWeight: 30/5 },
      { key: 'interestCoverage',   label: 'Faiz Karşılama',   bmKey: 'interestCoverage',   direction: 'higher', catWeight: 30/5 },
      { key: 'equityRatio',        label: 'Özkaynak Oranı',   bmKey: null,                 direction: 'none',   catWeight: 0 },
      { key: 'shortTermDebtRatio', label: 'KV Borç Oranı',    bmKey: 'shortTermDebtRatio', direction: 'lower',  catWeight: 30/5 },
    ],
  },
  {
    label: 'Faaliyet', color: '#7C3AED',
    ratios: [
      { key: 'assetTurnover',           label: 'Aktif Devir Hızı',       bmKey: 'assetTurnover',        direction: 'higher', catWeight: 15/5 },
      { key: 'inventoryTurnoverDays',   label: 'Stok Devir Süresi',      bmKey: 'inventoryDays',        direction: 'lower',  catWeight: 15/5 },
      { key: 'receivablesTurnoverDays', label: 'Alacak Tahsil Süresi',   bmKey: 'receivablesDays',      direction: 'lower',  catWeight: 15/5 },
      { key: 'payablesTurnoverDays',    label: 'Borç Ödeme Süresi',      bmKey: 'payablesTurnoverDays', direction: 'none',   catWeight: 0 },
      { key: 'fixedAssetTurnover',      label: 'Duran Varlık Devir',     bmKey: 'fixedAssetTurnover',   direction: 'higher', catWeight: 15/5 },
      { key: 'operatingExpenseRatio',   label: 'Faaliyet Gideri Oranı',  bmKey: 'operatingExpenseRatio',direction: 'lower',  catWeight: 15/5 },
    ],
  },
]

// Kritik eşikler — benchmark bağımsız uyarılar
const CRITICAL_CHECKS: { key: string; label: string; check: (v: number) => boolean; impact: number }[] = [
  { key: 'currentRatio',     label: 'Cari oran 1\'in altında — kısa vadeli yükümlülükler karşılanamıyor',    check: v => v < 1.0,  impact: 7 },
  { key: 'interestCoverage', label: 'Faiz karşılama oranı kritik — faiz yükü altında ezilme riski',          check: v => v < 1.5,  impact: 8 },
  { key: 'netProfitMargin',  label: 'Net kâr marjı negatif — zarar eden konsolide grup',                     check: v => v < 0,    impact: 6 },
  { key: 'equityRatio',      label: 'Özkaynak oranı %10\'un altında — aşırı kaldıraç / finansal kırılganlık',check: v => v < 0.10, impact: 7 },
  { key: 'debtToEbitda',     label: 'Net Borç/FAVÖK 8\'in üzerinde — sürdürülemez borç yükü',               check: v => v > 8,    impact: 6 },
  { key: 'quickRatio',       label: 'Asit-test oranı 0.5\'in altında — nakit döngüsü baskıda',              check: v => v < 0.5,  impact: 5 },
]

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function fmtAsset(v: number | null | undefined): string {
  const n = v ?? 0
  if (n <= 0) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Mr`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Mn`
  return new Intl.NumberFormat('tr-TR').format(Math.round(n))
}

function fmtSigned(v: number | null | undefined): { text: string; neg: boolean } {
  const n = v ?? 0
  const neg = n < 0
  const abs = Math.abs(n)
  let text = '—'
  if (abs >= 1e9) text = `${(abs / 1e9).toFixed(1)} Mr`
  else if (abs >= 1e6) text = `${(abs / 1e6).toFixed(1)} Mn`
  else if (abs > 0) text = new Intl.NumberFormat('tr-TR').format(Math.round(abs))
  return { text, neg }
}

function gradeColor(grade: string): string {
  if (['AAA', 'AA', 'A'].includes(grade)) return '#16a34a'
  if (['BBB', 'BB'].includes(grade)) return '#0B3C5D'
  if (grade === 'B') return '#D97706'
  return '#DC2626'
}

const DAY_KEYS = new Set([
  'inventoryTurnoverDays', 'receivablesTurnoverDays', 'payablesTurnoverDays',
  'cashConversionCycle', 'adjustedCashConversionCycle', 'customerAdvanceDays',
])
const PCT_KEYS = new Set([
  'grossMargin','ebitdaMargin','ebitMargin','netProfitMargin',
  'roa','roe','roic','revenueGrowth','realGrowth',
  'debtToAssets','equityRatio','shortTermDebtRatio','operatingExpenseRatio',
  'netWorkingCapitalRatio',
])

function fmtRatio(val: number | null | undefined, key: string): string {
  if (val == null) return '—'
  if (DAY_KEYS.has(key)) return `${Math.round(val)} gün`
  if (key === 'netWorkingCapital') return fmtAsset(val)
  if (PCT_KEYS.has(key)) return `${(val * 100).toFixed(1)}%`
  return val.toFixed(2)
}

// Benchmark ile karşılaştırma: +N% veya -N%
function benchmarkDelta(actual: number, bm: number, direction: RatioDir): {
  good: boolean; label: string; pct: number
} {
  if (direction === 'none') return { good: true, label: '', pct: 0 }
  const pct = ((actual - bm) / Math.abs(bm)) * 100
  const good = direction === 'higher' ? pct >= 0 : pct <= 0
  const absPct = Math.abs(pct)
  const sign = pct >= 0 ? '+' : '−'
  return { good, label: `${sign}${absPct.toFixed(0)}%`, pct }
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function GrupDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [activeTab, setActiveTab] = useState<'firmalar' | 'rating' | 'eliminasyonlar' | 'senaryo'>('firmalar')

  const [group,        setGroup]        = useState<GroupInfo | null>(null)
  const [entities,     setEntities]     = useState<EntityInfo[]>([])
  const [consolidated, setConsolidated] = useState<ConsolidatedResult | null>(null)
  const [eliminations, setEliminations] = useState<EliminationsData>(ZERO_ELIM)
  const [allEntities,  setAll]          = useState<AllEntity[]>([])
  const [loading,      setLoading]      = useState(true)

  const [addId,   setAddId]   = useState('')
  const [addType, setAddType] = useState('SUBSIDIARY')
  const [addOwn,  setAddOwn]  = useState('100')
  const [adding,  setAdding]  = useState(false)

  const [elimForm,   setElimForm]   = useState<EliminationsData>(ZERO_ELIM)
  const [savingElim, setSavingElim] = useState(false)
  const [elimSaved,  setElimSaved]  = useState(false)

  const loadData = useCallback(async () => {
    const [groupRes, allRes] = await Promise.all([
      fetch(`/api/groups/${id}`).then(r => r.json()),
      fetch('/api/entities').then(r => r.json()),
    ])
    if (groupRes.group) {
      setGroup(groupRes.group)
      setEntities(groupRes.entities ?? [])
      setConsolidated(groupRes.consolidated ?? null)
      const elim: EliminationsData = groupRes.eliminations ?? ZERO_ELIM
      setEliminations(elim)
      setElimForm(elim)
    }
    setAll(allRes.entities ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  const available = allEntities.filter(
    e => !e.groupId && !entities.some(ge => ge.id === e.id)
  )

  async function addEntity() {
    if (!addId) return
    setAdding(true)
    await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addEntityId: addId, entityType: addType, ownershipPct: Number(addOwn) / 100 }),
    })
    setAddId('')
    setAdding(false)
    await loadData()
  }

  async function removeEntity(entityId: string) {
    await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeEntityId: entityId }),
    })
    await loadData()
  }

  async function saveEliminations() {
    setSavingElim(true)
    const res = await fetch(`/api/groups/${id}/eliminations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(elimForm),
    })
    if (res.ok) {
      setElimSaved(true)
      await loadData()
      setTimeout(() => setElimSaved(false), 3000)
    }
    setSavingElim(false)
  }

  // ── Benchmark & skoru düşüren faktörler (rating sekmesi için) ─────────────
  const sectorBenchmark = useMemo(
    () => getSectorBenchmark(group?.sector),
    [group?.sector]
  )

  const draggingFactors = useMemo(() => {
    if (!consolidated) return []
    const ratios = consolidated.consolidatedRatios

    // 1) Kritik eşik ihlalleri
    const critical = CRITICAL_CHECKS
      .map(c => {
        const v = ratios[c.key]
        if (v == null || !c.check(v as number)) return null
        return { label: c.label, impact: c.impact, isCritical: true, key: c.key }
      })
      .filter(Boolean) as { label: string; impact: number; isCritical: boolean; key: string }[]

    // 2) Benchmark altındaki rasyolar
    const belowBm = RATIO_GROUPS.flatMap(g =>
      g.ratios
        .filter(r => r.bmKey && r.direction !== 'none')
        .map(r => {
          const actual = ratios[r.key]
          if (actual == null) return null
          const bmVal = sectorBenchmark[r.bmKey!] as number | undefined
          if (!bmVal) return null
          const { good, pct } = benchmarkDelta(actual as number, bmVal, r.direction)
          if (good) return null
          const shortfall = Math.min(1, Math.abs(pct) / 100)
          if (shortfall < 0.08) return null   // 8% altında önemsiz
          const impact = Math.min(8, r.catWeight * shortfall)
          const sign = pct >= 0 ? '+' : '−'
          const absPct = Math.abs(pct).toFixed(0)
          const label = `${r.label}: TCMB ortalamasının ${sign}${absPct}% ${r.direction === 'higher' ? 'altında' : 'üstünde'}`
          return { label, impact, isCritical: false, key: r.key }
        })
        .filter(Boolean)
    ) as { label: string; impact: number; isCritical: boolean; key: string }[]

    // Kritik olanlar önce, sonra etki büyüklüğüne göre sırala; duplikasyonları kaldır
    const criticalKeys = new Set(critical.map(c => c.key))
    const uniqueBelowBm = belowBm.filter(b => !criticalKeys.has(b.key))
    return [...critical, ...uniqueBelowBm].sort((a, b) => b.impact - a.impact).slice(0, 8)
  }, [consolidated, sectorBenchmark])

  // ── Render ────────────────────────────────────────────────────────────────
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

  // ── Gelir tablosu satırları ──────────────────────────────────────────────
  const ef = consolidated?.eliminatedFinancials ?? {}
  const IS_ROWS = [
    { label: 'Ciro (Net Satışlar)',           key: 'revenue',           indent: false, bold: false, separator: false },
    { label: '(-) Satışların Maliyeti',       key: 'cogs',              indent: true,  bold: false, separator: false, negative: true },
    { label: 'Brüt Kâr',                      key: 'grossProfit',       indent: false, bold: true,  separator: true  },
    { label: '(-) Faaliyet Giderleri',        key: 'operatingExpenses', indent: true,  bold: false, separator: false, negative: true },
    { label: 'FVÖK (EBIT)',                   key: 'ebit',              indent: false, bold: true,  separator: true  },
    { label: '(-) Faiz Giderleri',            key: 'interestExpense',   indent: true,  bold: false, separator: false, negative: true },
    { label: 'Net Kâr / Zarar',               key: 'netProfit',         indent: false, bold: true,  separator: true  },
  ]

  return (
    <DashboardShell>
    <div className="space-y-6">

      {/* ── Başlık ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/gruplar" className="text-gray-400 hover:text-[#0B3C5D] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#0B3C5D]">{group.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            {entities.length} şirket{group.sector ? ` · ${group.sector}` : ''}
          </p>
        </div>
        {consolidated && (
          <div className="text-right flex-shrink-0">
            <p style={{ fontSize: 28, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#0B3C5D', lineHeight: 1 }}>
              {Math.round(consolidated.consolidatedScore)}
            </p>
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold mt-0.5"
              style={{ background: '#0B3C5D', color: '#fff' }}>
              {consolidated.consolidatedGrade}
            </span>
          </div>
        )}
      </div>

      {/* ── Ana sekmeler ───────────────────────────────────────────────────── */}
      <div className="tab-group inline-flex">
        {([
          { key: 'firmalar',       label: 'Şirketler',  Icon: Building2 },
          { key: 'rating',         label: 'Konsolide',  Icon: BarChart3  },
          { key: 'eliminasyonlar', label: 'Tenzilat',   Icon: GitBranch  },
          { key: 'senaryo',        label: 'Senaryo',    Icon: Sliders    },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`tab flex items-center gap-1.5 px-4 py-2 text-sm${activeTab === key ? ' active' : ''}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 1 — FİRMALAR
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'firmalar' && (
        <div className="max-w-2xl space-y-4">
          {available.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-head"><h2 className="card-title text-sm">Şirket Ekle</h2></div>
              <div className="card-body">
                <div className="flex flex-wrap gap-3">
                  <select value={addId} onChange={e => setAddId(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    <option value="">— Şirket seçin —</option>
                    {available.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <select value={addType} onChange={e => setAddType(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    {ENTITY_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" value={addOwn} onChange={e => setAddOwn(e.target.value)}
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
            <div className="card-head"><h2 className="card-title text-sm">Grup Firmaları</h2></div>
            {entities.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 size={28} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>Gruba henüz şirket eklenmedi.</p>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 72px 100px 88px 32px',
                  gap: 8, padding: '8px 20px',
                  borderBottom: '1px solid #F1F5F9', background: '#F8FAFC',
                }}>
                  {['FİRMA', 'SKOR', 'DERECELENDİRME', 'AKTİF', ''].map((h, i) => (
                    <span key={i} style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8',
                      textAlign: i > 0 ? 'right' : 'left', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>
                <div className="divide-y divide-[#F1F5F9]">
                  {entities.map(e => (
                    <div key={e.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 72px 100px 88px 32px',
                      gap: 8, padding: '10px 20px', alignItems: 'center',
                    }}>
                      <div className="min-w-0">
                        <Link href={`/dashboard/sirketler/${e.id}`}
                          className="text-sm font-medium text-[#0B3C5D] hover:underline block truncate">{e.name}</Link>
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>%{Math.round(e.ownershipPct)} sahiplik</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {e.latestAnalysis
                          ? <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#0B3C5D', fontVariantNumeric: 'tabular-nums' }}>{Math.round(e.latestAnalysis.finalScore)}</span>
                          : <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {e.latestAnalysis
                          ? <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${gradeColor(e.latestAnalysis.grade)}18`, color: gradeColor(e.latestAnalysis.grade) }}>{e.latestAnalysis.grade}</span>
                          : <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{fmtAsset(e.totalAssets)}</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => removeEntity(e.id)}
                          style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#CBD5E1', transition: 'color 0.15s' }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = '#f87171')}
                          onMouseLeave={ev => (ev.currentTarget.style.color = '#CBD5E1')}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 2 — KONSOLİDE RATING
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'rating' && (
        <div className="max-w-3xl space-y-5">
          {!consolidated ? (
            <div className="card p-10 text-center">
              <BarChart3 size={32} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>Konsolide skor hesaplanamadı.</p>
              <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>Gruba analizi tamamlanmış şirket ekleyin.</p>
            </div>
          ) : (
            <>

              {/* Tenzilat girilmediyse uyarı banner */}
              {Object.values(eliminations).every(v => v === 0) && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 16px', borderRadius: 12,
                  background: '#FFFBEB', border: '1px solid #FDE68A',
                }}>
                  <AlertTriangle size={14} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: '#B45309', margin: 0 }}>
                    Bu grup için henüz tenzilat girilmedi. Tablolar ham konsolide toplamını gösteriyor.
                  </p>
                </div>
              )}

              {/* ────────────────────────────────────────────────────────────
                  1. KONSOLİDE BİLANÇO
              ──────────────────────────────────────────────────────────── */}
              <div className="card overflow-hidden">
                <div className="card-head" style={{ background: '#F8FAFC' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                      KONSOLİDE BİLANÇO
                    </h2>
                    <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>
                      Eliminasyon sonrası • {group.sector || 'Konsolide'}
                    </span>
                  </div>
                </div>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                    {/* AKTİF */}
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#2EC4B6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                        AKTİF
                      </p>
                      {[
                        { label: 'Dönen Varlıklar',  key: 'totalCurrentAssets',    sub: true  },
                        { label: 'Duran Varlıklar',  key: 'totalNonCurrentAssets', sub: true  },
                        { label: 'TOPLAM AKTİF',     key: 'totalAssets',           sub: false },
                      ].map(({ label, key, sub }) => {
                        const { text, neg } = fmtSigned(ef[key])
                        return (
                          <div key={key} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: sub ? '5px 0 5px 12px' : '8px 0 0 0',
                            borderTop: !sub ? '1px solid #E5E9F0' : undefined,
                            marginTop: !sub ? 4 : 0,
                          }}>
                            <span style={{ fontSize: sub ? 12 : 12, fontWeight: sub ? 400 : 700, color: sub ? '#64748B' : '#0B3C5D' }}>{label}</span>
                            <span style={{ fontSize: 12, fontWeight: sub ? 500 : 700, color: neg ? '#DC2626' : sub ? '#1E293B' : '#0B3C5D', fontVariantNumeric: 'tabular-nums', fontFamily: 'Outfit, sans-serif' }}>
                              {neg ? '-' : ''}{text}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* PASİF + ÖZKAYNAK */}
                    <div style={{ borderLeft: '1px solid #F1F5F9', paddingLeft: 24 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#D97706', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                        PASİF + ÖZKAYNAK
                      </p>
                      {[
                        { label: 'Kısa Vadeli Borçlar', key: 'totalCurrentLiabilities',    sub: true  },
                        { label: 'Uzun Vadeli Borçlar', key: 'totalNonCurrentLiabilities',  sub: true  },
                        { label: 'Özkaynak',             key: 'totalEquity',                sub: true  },
                        { label: 'TOPLAM PASİF+ÖZK',    key: 'totalLiabilitiesAndEquity',  sub: false },
                      ].map(({ label, key, sub }) => {
                        const { text, neg } = fmtSigned(ef[key])
                        return (
                          <div key={key} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: sub ? '5px 0 5px 12px' : '8px 0 0 0',
                            borderTop: !sub ? '1px solid #E5E9F0' : undefined,
                            marginTop: !sub ? 4 : 0,
                          }}>
                            <span style={{ fontSize: 12, fontWeight: sub ? 400 : 700, color: sub ? '#64748B' : '#0B3C5D' }}>{label}</span>
                            <span style={{ fontSize: 12, fontWeight: sub ? 500 : 700, color: neg ? '#DC2626' : sub ? '#1E293B' : '#0B3C5D', fontVariantNumeric: 'tabular-nums', fontFamily: 'Outfit, sans-serif' }}>
                              {neg ? '-' : ''}{text}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Azınlık payı notu */}
                  {(ef['minorityInterest'] ?? 0) !== 0 && (
                    <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
                      * Azınlık payına düşen net kâr/zarar: {fmtSigned(ef['minorityInterest']).text} TL
                    </p>
                  )}
                </div>
              </div>

              {/* ────────────────────────────────────────────────────────────
                  2. KONSOLİDE GELİR TABLOSU
              ──────────────────────────────────────────────────────────── */}
              <div className="card overflow-hidden">
                <div className="card-head" style={{ background: '#F8FAFC' }}>
                  <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                    KONSOLİDE GELİR TABLOSU
                  </h2>
                </div>
                <div style={{ padding: '0 0 4px' }}>
                  {IS_ROWS.map(({ label, key, indent, bold, separator, negative }) => {
                    const { text, neg } = fmtSigned(ef[key])
                    const displayNeg = neg !== Boolean(negative)   // negative row with positive value → show red
                    return (
                      <div key={key} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '7px 20px 7px ' + (indent ? '32px' : '20px'),
                        borderTop: separator ? '1px solid #E5E9F0' : '1px solid #F8FAFC',
                        background: bold && !indent ? '#FAFAFA' : 'white',
                      }}>
                        <span style={{ fontSize: 12, fontWeight: bold ? 700 : 400, color: bold ? '#0B3C5D' : '#64748B' }}>
                          {label}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: bold ? 700 : 500,
                          fontFamily: 'Outfit, sans-serif',
                          color: displayNeg ? '#DC2626' : bold ? '#0B3C5D' : '#1E293B',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {negative && !neg && text !== '—' ? '-' : ''}{neg && !negative ? '-' : ''}{text}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ────────────────────────────────────────────────────────────
                  3. KRİTİK FAKTÖRLER
              ──────────────────────────────────────────────────────────── */}
              {(() => {
                const violations = CRITICAL_CHECKS.filter(c => {
                  const v = consolidated.consolidatedRatios[c.key]
                  return v != null && c.check(v as number)
                })
                if (violations.length === 0) return null
                return (
                  <div className="card overflow-hidden">
                    <div className="card-head" style={{ background: '#FFF7ED' }}>
                      <div className="flex items-center gap-2">
                        <TrendingDown size={13} style={{ color: '#D97706' }} />
                        <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400E' }}>
                          KRİTİK FAKTÖRLER
                        </h2>
                      </div>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      {violations.map((c, i) => (
                        <div key={c.key} style={{
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                          padding: '9px 20px',
                          borderTop: i > 0 ? '1px solid #FEF3C7' : 'none',
                          background: '#FFFBEB',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                            <AlertTriangle size={13} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
                            <p style={{ fontSize: 12, color: '#B45309', margin: 0, lineHeight: 1.5 }}>{c.label}</p>
                          </div>
                          <span style={{
                            flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: c.impact >= 6 ? '#FEE2E2' : '#FEF3C7',
                            color: c.impact >= 6 ? '#DC2626' : '#B45309',
                            whiteSpace: 'nowrap',
                          }}>
                            −{c.impact.toFixed(0)} puan
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* ────────────────────────────────────────────────────────────
                  4. KONSOLİDE SKOR + KATEGORİ SKORLARI (tek kart)
              ──────────────────────────────────────────────────────────── */}

              {/* En zayıf halka uyarısı */}
              {consolidated.weakestLinkApplied === true && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 16px', borderRadius: 12,
                  background: '#FFFBEB', border: '1px solid #FDE68A',
                }}>
                  <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: '#B45309', margin: 0 }}>
                    <strong>En zayıf halka guardrail uygulandı</strong> — grup içinde CCC altı (skor &lt; 44) firma var. Konsolide skor 60 ile sınırlandırıldı.
                  </p>
                </div>
              )}

              <div className="card overflow-hidden">
                <div className="card-head" style={{ background: '#F8FAFC' }}>
                  <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                    KONSOLİDE GRUP SKORU
                  </h2>
                </div>
                <div className="card-body">
                  {/* Büyük skor + not */}
                  <div className="flex items-end gap-6">
                    <div>
                      <p style={{ fontSize: 80, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#0B3C5D', lineHeight: 1 }}>
                        {Math.round(consolidated.consolidatedScore)}
                      </p>
                      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>/100</p>
                    </div>
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{ display: 'inline-flex', padding: '4px 14px', borderRadius: 8, fontSize: 16, fontWeight: 800, background: '#0B3C5D', color: '#fff' }}>
                        {consolidated.consolidatedGrade}
                      </div>
                      <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{RATING_LABEL[consolidated.consolidatedGrade] ?? ''}</p>
                    </div>
                  </div>
                  {/* Ağırlıklı ortalama */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 12, color: '#64748B' }}>Ağırlıklı ortalama (aktif bazlı):</p>
                    <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#5A7A96', fontVariantNumeric: 'tabular-nums' }}>
                      {consolidated.weightedAverageScore.toFixed(1)}
                    </span>
                  </div>
                  {/* Kategori skorları grid */}
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                      KATEGORİ SKORLARI
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {([
                        { label: 'Likidite',  value: consolidated.liquidityScore,     weight: '%25', color: '#2EC4B6' },
                        { label: 'Kârlılık',  value: consolidated.profitabilityScore, weight: '%30', color: '#0B3C5D' },
                        { label: 'Kaldıraç',  value: consolidated.leverageScore,      weight: '%30', color: '#D97706' },
                        { label: 'Faaliyet',  value: consolidated.activityScore,      weight: '%15', color: '#7C3AED' },
                      ] as const).map(({ label, value, weight, color }) => (
                        <div key={label} style={{ borderRadius: 10, padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E5E9F0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                            <span style={{ fontSize: 10, color: '#CBD5E1' }}>{weight}</span>
                          </div>
                          <p style={{ fontSize: 30, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#0B3C5D', lineHeight: 1 }}>
                            {Math.round(value)}
                          </p>
                          <div style={{ marginTop: 7, height: 4, borderRadius: 99, background: '#E5E9F0' }}>
                            <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, ${color} 0%, #0B3C5D 100%)` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 3 — ELİMİNASYONLAR
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'eliminasyonlar' && (
        <div className="max-w-xl space-y-4">
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 16px', borderRadius: 12,
            background: '#EDF4F8', border: '1px solid rgba(11,60,93,0.12)',
          }}>
            <GitBranch size={14} style={{ color: '#0B3C5D', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: '#0B3C5D', margin: 0 }}>
              Grup içi işlem eliminasyonları konsolide finansal tablolardan düşülür.
              Kaydedildiğinde konsolide skor otomatik olarak yeniden hesaplanır.
            </p>
          </div>
          <div className="card overflow-hidden">
            <div className="card-head"><h2 className="card-title text-sm">Grup İçi Eliminasyonlar</h2></div>
            <div className="card-body space-y-4">
              {ELIM_FIELDS.map(({ key, label, hint }) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1E293B', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{hint}</p>
                  </div>
                  <input type="number" min={0} value={elimForm[key]}
                    onChange={ev => setElimForm(prev => ({ ...prev, [key]: Number(ev.target.value) || 0 }))}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-right text-[#1E293B] tabular-nums focus:outline-none focus:border-cyan-500" />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                {elimSaved
                  ? <p style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>✓ Kaydedildi — konsolide skor yeniden hesaplandı</p>
                  : <p style={{ fontSize: 12, color: '#94A3B8' }}>Tüm alanlar TL cinsinden girilmelidir.</p>}
                <button onClick={saveEliminations} disabled={savingElim}
                  className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                  {savingElim ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
                </button>
              </div>
            </div>
          </div>
          {Object.values(eliminations).some(v => v > 0) && (
            <div className="card overflow-hidden">
              <div className="card-head" style={{ background: '#F8FAFC' }}>
                <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>KAYITLI ELİMİNASYONLAR</h2>
              </div>
              <div className="divide-y divide-[#F1F5F9]">
                {ELIM_FIELDS.filter(f => eliminations[f.key] > 0).map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px' }}>
                    <span style={{ fontSize: 12, color: '#1E293B' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                      -{fmtAsset(eliminations[key])} TL
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 4 — SENARYO ANALİZİ
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'senaryo' && (
        <div className="space-y-4">
          {!consolidated ? (
            <div className="card p-10 text-center">
              <Sliders size={32} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>Senaryo analizi için önce konsolide skor hesaplanmalıdır.</p>
              <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>Gruba analizi tamamlanmış şirket ekleyin.</p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 16px', borderRadius: 12,
                background: '#EDF4F8', border: '1px solid rgba(11,60,93,0.12)',
              }}>
                <Sliders size={14} style={{ color: '#0B3C5D', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#0B3C5D', margin: 0 }}>
                  Konsolide rasyo başlangıç noktası olarak kullanılmaktadır. Kaldıraç değişikliklerinin grup skoru üzerindeki etkisini simüle edin.
                </p>
              </div>
              <WhatIfSimulator
                baseData={consolidated.consolidatedRatios}
                baseScore={consolidated.consolidatedScore}
                rawFinancialData={consolidated.eliminatedFinancials}
              />
            </>
          )}
        </div>
      )}

    </div>
    </DashboardShell>
  )
}
