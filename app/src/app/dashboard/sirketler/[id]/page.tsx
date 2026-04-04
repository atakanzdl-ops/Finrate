'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, BarChart3, Loader2, ChevronDown, ChevronUp, Upload, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { FileUpload } from '@/components/analysis/FileUpload'
import DashboardShell from '@/components/layout/DashboardShell'

interface FinancialData {
  id: string
  year: number
  period: string
  // Özet
  revenue: number | null
  ebitda: number | null
  netProfit: number | null
  totalAssets: number | null
  totalEquity: number | null
  // Dönen Varlıklar
  cash: number | null
  shortTermInvestments: number | null
  tradeReceivables: number | null
  inventory: number | null
  otherCurrentAssets: number | null
  totalCurrentAssets: number | null
  // Duran Varlıklar
  tangibleAssets: number | null
  intangibleAssets: number | null
  longTermInvestments: number | null
  otherNonCurrentAssets: number | null
  totalNonCurrentAssets: number | null
  // Kısa Vadeli Borçlar
  shortTermFinancialDebt: number | null
  tradePayables: number | null
  otherCurrentLiabilities: number | null
  totalCurrentLiabilities: number | null
  // Uzun Vadeli Borçlar
  longTermFinancialDebt: number | null
  otherNonCurrentLiabilities: number | null
  totalNonCurrentLiabilities: number | null
  // Öz Kaynak
  paidInCapital: number | null
  retainedEarnings: number | null
  netProfitCurrentYear: number | null
  totalLiabilitiesAndEquity: number | null
  // Gelir Tablosu
  cogs: number | null
  grossProfit: number | null
  operatingExpenses: number | null
  ebit: number | null
  depreciation: number | null
  interestExpense: number | null
  otherIncome: number | null
  otherExpense: number | null
  ebt: number | null
  taxExpense: number | null
}

interface Entity {
  id: string
  name: string
  taxNumber: string | null
  sector: string | null
  entityType: string
  financialData: FinancialData[]
}

const PERIOD_LABELS: Record<string, string> = {
  ANNUAL: 'Kesin Beyan', Q1: '1. Geçici', Q2: '2. Geçici', Q3: '3. Geçici', Q4: '4. Geçici',
}

function fmt(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)
}

export default function SirketDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [entity, setEntity]       = useState<Entity | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [deletingFd, setDeletingFd] = useState<string | null>(null)
  const [confirmFd, setConfirmFd]   = useState<string | null>(null)

  async function deleteFd(fdId: string) {
    if (!entity) return
    setDeletingFd(fdId)
    try {
      await fetch(`/api/entities/${id}/financial-data/${fdId}`, { method: 'DELETE' })
      setEntity((prev) => prev
        ? { ...prev, financialData: prev.financialData.filter((f) => f.id !== fdId) }
        : prev
      )
    } finally {
      setDeletingFd(null)
      setConfirmFd(null)
    }
  }

  function reload() {
    fetch(`/api/entities/${id}`)
      .then((r) => r.json())
      .then((d) => setEntity(d.entity))
  }

  useEffect(() => {
    fetch(`/api/entities/${id}`)
      .then((r) => r.json())
      .then((d) => setEntity(d.entity))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <DashboardShell>
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-cyan-400" />
      </div>
    </DashboardShell>
  )
  if (!entity) return (
    <DashboardShell>
      <p className="text-white/50">Şirket bulunamadı.</p>
    </DashboardShell>
  )

  return (
    <DashboardShell>
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sirketler" className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{entity.name}</h1>
          <p className="text-white/40 text-xs mt-0.5">
            {entity.sector && `${entity.sector} · `}
            {entity.taxNumber && `VKN: ${entity.taxNumber} · `}
            {entity.financialData.length} dönem veri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowUpload(!showUpload); setShowForm(false) }}
            className="flex items-center gap-2 px-3 py-2 glass border border-white/10 hover:border-cyan-500/30 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-all"
          >
            <Upload size={14} />
            Excel / PDF
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowUpload(false) }}
            className="flex items-center gap-2 px-3 py-2 btn-gradient rounded-lg text-xs font-semibold text-white"
          >
            <Plus size={14} />
            Manuel Giriş
            {showForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Excel/CSV Upload */}
      {showUpload && (
        <div className="glass-card rounded-xl p-5">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">
            Excel / CSV İçe Aktar
          </p>
          <FileUpload entityId={id} onImported={() => { reload(); setShowUpload(false) }} />
        </div>
      )}

      {/* Manuel Finansal Veri Formu */}
      {showForm && (
        <FinancialDataForm
          entityId={id}
          onSaved={(fd) => {
            setEntity((prev) => prev
              ? { ...prev, financialData: [fd, ...prev.financialData.filter(f => f.id !== fd.id)] }
              : prev
            )
            setShowForm(false)
          }}
        />
      )}

      {/* Dönem Tablosu */}
      {entity.financialData.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <BarChart3 size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Henüz finansal veri girilmedi.</p>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-white/50 font-medium text-xs">Dönem</th>
                  <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Ciro</th>
                  <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">FAVÖK</th>
                  <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Net Kar</th>
                  <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Toplam Varlık</th>
                  <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Öz Kaynak</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entity.financialData.map((fd) => (
                  <tr key={fd.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white">{fd.year}</span>
                      <span className="ml-2 text-xs text-white/40">{PERIOD_LABELS[fd.period]}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.revenue)}</td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.ebitda)}</td>
                    <td className={clsx('px-4 py-3 text-right', fd.netProfit != null && fd.netProfit < 0 ? 'text-red-400' : 'text-white/80')}>
                      {fmt(fd.netProfit)}
                    </td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.totalAssets)}</td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.totalEquity)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/dashboard/analiz?entityId=${entity.id}&year=${fd.year}&period=${fd.period}`}
                          className="text-xs text-cyan-400 hover:underline"
                        >
                          Analiz
                        </Link>
                        {confirmFd === fd.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => deleteFd(fd.id)}
                              disabled={deletingFd === fd.id}
                              className="text-xs px-2 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded hover:bg-red-500/30 transition-all disabled:opacity-50"
                            >
                              {deletingFd === fd.id ? '...' : 'Sil'}
                            </button>
                            <button
                              onClick={() => setConfirmFd(null)}
                              className="text-xs text-white/30 hover:text-white/60 transition-colors"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmFd(fd.id)}
                            className="text-white/20 hover:text-red-400 transition-colors"
                            title="Bu dönemi sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TDHP Bilanço & Gelir Tablosu Detay Paneli */}
      {entity.financialData.length > 0 && (
        <TdhpPanel data={entity.financialData} />
      )}
    </div>
    </DashboardShell>
  )
}

// ─── TDHP Bilanço ve Gelir Tablosu Paneli ─────────────────
function TdhpPanel({ data }: { data: FinancialData[] }) {
  const [selectedId, setSelectedId] = useState(data[0]?.id ?? '')
  const fd = data.find(d => d.id === selectedId) ?? data[0]
  if (!fd) return null

  const PERIOD_LABELS: Record<string, string> = {
    ANNUAL: 'Kesin Beyan', Q1: '1. Geçici', Q2: '2. Geçici', Q3: '3. Geçici', Q4: '4. Geçici',
  }

  function r(v: number | null | undefined) {
    if (v == null) return '—'
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)
  }

  const AKTIF = [
    { label: 'A — DÖNEN VARLIKLAR', value: fd.totalCurrentAssets, bold: true },
    { label: '  Nakit ve Nakit Benzerleri', value: fd.cash },
    { label: '  Kısa Vadeli Yatırımlar', value: fd.shortTermInvestments },
    { label: '  Ticari Alacaklar', value: fd.tradeReceivables },
    { label: '  Stoklar', value: fd.inventory },
    { label: '  Diğer Dönen Varlıklar', value: fd.otherCurrentAssets },
    { label: 'B — DURAN VARLIKLAR', value: fd.totalNonCurrentAssets, bold: true },
    { label: '  Maddi Duran Varlıklar', value: fd.tangibleAssets },
    { label: '  Maddi Olmayan Duran Varlıklar', value: fd.intangibleAssets },
    { label: '  Uzun Vadeli Yatırımlar', value: fd.longTermInvestments },
    { label: '  Diğer Duran Varlıklar', value: fd.otherNonCurrentAssets },
    { label: 'AKTİF TOPLAM', value: fd.totalAssets, bold: true, total: true },
  ]

  const PASIF = [
    { label: 'A — KISA VADELİ BORÇLAR', value: fd.totalCurrentLiabilities, bold: true },
    { label: '  KV Finansal Borçlar', value: fd.shortTermFinancialDebt },
    { label: '  Ticari Borçlar', value: fd.tradePayables },
    { label: '  Diğer KV Borçlar', value: fd.otherCurrentLiabilities },
    { label: 'B — UZUN VADELİ BORÇLAR', value: fd.totalNonCurrentLiabilities, bold: true },
    { label: '  UV Finansal Borçlar', value: fd.longTermFinancialDebt },
    { label: '  Diğer UV Borçlar', value: fd.otherNonCurrentLiabilities },
    { label: 'C — ÖZ KAYNAKLAR', value: fd.totalEquity, bold: true },
    { label: '  Ödenmiş Sermaye', value: fd.paidInCapital },
    { label: '  Geçmiş Yıl Karları', value: fd.retainedEarnings },
    { label: '  Dönem Net Karı', value: fd.netProfitCurrentYear ?? fd.netProfit },
    { label: 'PASİF TOPLAM', value: fd.totalLiabilitiesAndEquity ?? fd.totalAssets, bold: true, total: true },
  ]

  const GELIR = [
    { label: 'Net Satışlar / Ciro', value: fd.revenue, bold: true },
    { label: 'Satışların Maliyeti (−)', value: fd.cogs },
    { label: 'Brüt Kar', value: fd.grossProfit, bold: true },
    { label: 'Faaliyet Giderleri (−)', value: fd.operatingExpenses },
    { label: 'Faaliyet Karı (FVÖK)', value: fd.ebit, bold: true },
    { label: '  Amortisman (+)', value: fd.depreciation },
    { label: 'FAVÖK', value: fd.ebitda, bold: true },
    { label: 'Finansman Gideri (−)', value: fd.interestExpense },
    { label: 'Diğer Gelirler', value: fd.otherIncome },
    { label: 'Diğer Giderler (−)', value: fd.otherExpense },
    { label: 'Vergi Öncesi Kar (EBT)', value: fd.ebt, bold: true },
    { label: 'Vergi Gideri (−)', value: fd.taxExpense },
    { label: 'Net Kar', value: fd.netProfit, bold: true, total: true },
  ]

  // Hiç veri yoksa paneli gösterme
  const hasData = AKTIF.some(r => r.value != null) || GELIR.some(r => r.value != null)
  if (!hasData) return null

  function TdhpRow({ label, value, bold, total }: { label: string; value: number | null | undefined; bold?: boolean; total?: boolean }) {
    return (
      <div className={clsx(
        'flex justify-between px-4 py-1.5 text-xs',
        total ? 'border-t border-white/10 mt-1 pt-2 font-black text-white' :
        bold  ? 'font-bold text-white/90 mt-2' : 'text-white/60',
      )}>
        <span>{label}</span>
        <span className={clsx('font-mono tabular-nums', value != null && value < 0 ? 'text-red-400' : '')}>{r(value)}</span>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Dönem seçici */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">TEK DÜZEN HESAP PLANI · </span>
        <div className="flex gap-2 flex-wrap">
          {data.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={clsx(
                'text-[10px] px-3 py-1 rounded-lg font-bold uppercase tracking-wider border transition-all',
                selectedId === d.id
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
              )}
            >
              {d.year} · {PERIOD_LABELS[d.period] ?? d.period}
            </button>
          ))}
        </div>
      </div>

      {/* İçerik: 3 sütun */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
        {/* AKTİF */}
        <div className="py-4">
          <p className="px-4 pb-2 text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400">Aktif (Varlıklar)</p>
          {AKTIF.map((row, i) => <TdhpRow key={i} {...row} />)}
        </div>

        {/* PASİF */}
        <div className="py-4">
          <p className="px-4 pb-2 text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400">Pasif (Kaynaklar)</p>
          {PASIF.map((row, i) => <TdhpRow key={i} {...row} />)}
        </div>

        {/* GELİR TABLOSU */}
        <div className="py-4">
          <p className="px-4 pb-2 text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400">Gelir Tablosu</p>
          {GELIR.map((row, i) => <TdhpRow key={i} {...row} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Finansal Veri Formu ───────────────────────────────────
interface FormProps {
  entityId: string
  onSaved: (fd: FinancialData) => void
}

const FORM_SECTIONS = [
  {
    title: 'Dönen Varlıklar (Aktif)',
    fields: [
      { key: 'cash',                  label: 'Nakit ve Nakit Benzerleri' },
      { key: 'shortTermInvestments',  label: 'Kısa Vadeli Yatırımlar' },
      { key: 'tradeReceivables',      label: 'Ticari Alacaklar' },
      { key: 'inventory',             label: 'Stoklar' },
      { key: 'otherCurrentAssets',    label: 'Diğer Dönen Varlıklar' },
      { key: 'totalCurrentAssets',    label: 'Dönen Varlıklar Toplamı' },
    ],
  },
  {
    title: 'Duran Varlıklar',
    fields: [
      { key: 'tangibleAssets',          label: 'Maddi Duran Varlıklar' },
      { key: 'intangibleAssets',        label: 'Maddi Olmayan Duran Varlıklar' },
      { key: 'longTermInvestments',     label: 'Uzun Vadeli Yatırımlar' },
      { key: 'otherNonCurrentAssets',   label: 'Diğer Duran Varlıklar' },
      { key: 'totalNonCurrentAssets',   label: 'Duran Varlıklar Toplamı' },
      { key: 'totalAssets',             label: 'Toplam Aktif' },
    ],
  },
  {
    title: 'Kısa Vadeli Borçlar',
    fields: [
      { key: 'shortTermFinancialDebt',    label: 'KV Finansal Borçlar' },
      { key: 'tradePayables',             label: 'Ticari Borçlar' },
      { key: 'otherCurrentLiabilities',   label: 'Diğer KV Borçlar' },
      { key: 'totalCurrentLiabilities',   label: 'KV Borçlar Toplamı' },
    ],
  },
  {
    title: 'Uzun Vadeli Borçlar & Öz Kaynak (Pasif)',
    fields: [
      { key: 'longTermFinancialDebt',         label: 'UV Finansal Borçlar' },
      { key: 'otherNonCurrentLiabilities',    label: 'Diğer UV Borçlar' },
      { key: 'totalNonCurrentLiabilities',    label: 'UV Borçlar Toplamı' },
      { key: 'paidInCapital',                 label: 'Ödenmiş Sermaye' },
      { key: 'retainedEarnings',              label: 'Geçmiş Yıl Karları' },
      { key: 'netProfitCurrentYear',          label: 'Dönem Net Karı' },
      { key: 'totalEquity',                   label: 'Toplam Öz Kaynak' },
      { key: 'totalLiabilitiesAndEquity',     label: 'Pasif Toplamı' },
      { key: 'purchases',                     label: 'Satın Alımlar (DPO için)' },
    ],
  },
  {
    title: 'Gelir Tablosu',
    fields: [
      { key: 'revenue',          label: 'Net Satışlar / Ciro' },
      { key: 'cogs',             label: 'Satışların Maliyeti (SMM)' },
      { key: 'grossProfit',      label: 'Brüt Kar' },
      { key: 'operatingExpenses',label: 'Faaliyet Giderleri' },
      { key: 'ebit',             label: 'FVÖK / EBIT' },
      { key: 'depreciation',     label: 'Amortisman' },
      { key: 'ebitda',           label: 'FAVÖK / EBITDA' },
      { key: 'interestExpense',  label: 'Finansman Gideri' },
      { key: 'otherIncome',      label: 'Diğer Gelirler' },
      { key: 'otherExpense',     label: 'Diğer Giderler' },
      { key: 'ebt',              label: 'Vergi Öncesi Kar' },
      { key: 'taxExpense',       label: 'Vergi Gideri' },
      { key: 'netProfit',        label: 'Net Kar' },
    ],
  },
]

function FinancialDataForm({ entityId, onSaved }: FormProps) {
  const [year, setYear]     = useState(new Date().getFullYear() - 1)
  const [period, setPeriod] = useState('ANNUAL')
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  function setVal(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function handleSave() {
    setError('')
    setLoading(true)
    try {
      const numericValues: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(values)) {
        const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
        numericValues[k] = isNaN(n) ? null : n
      }

      const res = await fetch(`/api/entities/${entityId}/financial-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, period, ...numericValues }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Hata oluştu.'); return }
      onSaved(data.financialData)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-5">
      {/* Dönem seçimi */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">Yıl</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">Dönem</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 bg-navy-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
          >
            {Object.entries(PERIOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alanlar */}
      {FORM_SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            {section.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.fields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-white/50 mb-1">{label}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values[key] ?? ''}
                  onChange={(e) => setVal(key, e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Kaydet & Skor Hesapla
        </button>
      </div>
    </div>
  )
}
