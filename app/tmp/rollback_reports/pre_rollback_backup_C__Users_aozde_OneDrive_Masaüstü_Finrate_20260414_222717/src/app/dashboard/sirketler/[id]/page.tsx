'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, Loader2, Upload, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { FileUpload } from '@/components/analysis/FileUpload'
import { TdhpSpreadsheet } from '@/components/analysis/TdhpSpreadsheet'

interface FinancialData {
  id: string
  year: number
  period: string
  source?: string
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

/** Kaynak badge metni ve renk stili */
function sourceBadge(source?: string): { label: string; bg: string; color: string } | null {
  if (!source) return null
  if (source === 'KVB')      return { label: 'KVB',       bg: '#DBEAFE', color: '#1D4ED8' }
  if (source === 'YGVB')     return { label: 'YGVB',      bg: '#DBEAFE', color: '#1D4ED8' }
  if (source === 'GVB')      return { label: 'GVB',       bg: '#FEF9C3', color: '#92400E' }
  if (source === 'EXCEL_GT') return { label: 'Excel GT',  bg: '#DCFCE7', color: '#166534' }
  if (source === 'EXCEL' || source === 'CSV') return { label: 'Excel Miz', bg: '#DCFCE7', color: '#166534' }
  return null
}

function fmt(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)
}

export default function SirketDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [entity, setEntity]       = useState<Entity | null>(null)
  const [loading, setLoading]     = useState(true)
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
      .then(async (r) => {
        const text = await r.text()
        if (!text) return null
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      })
      .then((d) => setEntity(d?.entity ?? null))
  }

  useEffect(() => {
    fetch(`/api/entities/${id}`)
      .then(async (r) => {
        const text = await r.text()
        if (!text) return null
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      })
      .then((d) => setEntity(d?.entity ?? null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <>
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin" style={{ color: '#2EC4B6' }} />
      </div>
    </>
  )
  if (!entity) return (
    <>
      <p className="text-slate-400">Şirket bulunamadı.</p>
    </>
  )

  return (
    <>
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sirketler" className="text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: '#0B3C5D' }}>{entity.name}</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {entity.sector && `${entity.sector} · `}
            {entity.taxNumber && `VKN: ${entity.taxNumber} · `}
            {entity.financialData.length} dönem veri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 transition-all shadow-sm"
          >
            <Upload size={14} />
            Excel / PDF
          </button>
        </div>
      </div>

      {/* Upload Paneli */}
      {showUpload && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Dosya Yükle
          </p>
          <p className="text-[11px] text-slate-400 mb-4">
            .xlsx, .xls, .csv ve .pdf — aynı anda birden fazla dosya seçilebilir
          </p>
          <FileUpload entityId={id} onImported={() => { reload(); setShowUpload(false) }} />
        </div>
      )}

      {/* Dönem Özet Tablosu — veri yoksa başlık + boş satır, yapı değişmez */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Dönem</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs">Ciro</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs">FAVÖK / FVÖK</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs">Net Kar</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs">Toplam Varlık</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-xs">Öz Kaynak</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entity.financialData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Henüz finansal veri girilmedi. Excel veya PDF yükleyin.
                  </td>
                </tr>
              ) : entity.financialData.map((fd) => (
                  <tr key={fd.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">{fd.year}</span>
                      <span
                        className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: '#0B3C5D', color: '#ffffff' }}
                      >{PERIOD_LABELS[fd.period] ?? fd.period}</span>
                      {(() => { const b = sourceBadge(fd.source); return b ? (
                        <span
                          className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: b.bg, color: b.color }}
                        >{b.label}</span>
                      ) : null })()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(fd.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {fd.ebitda != null
                        ? <>{fmt(fd.ebitda)} <span className="text-[10px] text-slate-400">FAVÖK</span></>
                        : fd.ebit != null
                          ? <>{fmt(fd.ebit)} <span className="text-[10px] text-slate-400">FVÖK</span></>
                          : '—'
                      }
                    </td>
                    <td className={clsx('px-4 py-3 text-right', fd.netProfit != null && fd.netProfit < 0 ? 'text-red-500' : 'text-slate-700')}>
                      {fmt(fd.netProfit)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(fd.totalAssets)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(fd.totalEquity)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {confirmFd === fd.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => deleteFd(fd.id)}
                              disabled={deletingFd === fd.id}
                              className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 text-red-500 rounded hover:bg-red-100 transition-all disabled:opacity-50"
                            >
                              {deletingFd === fd.id ? '...' : 'Sil'}
                            </button>
                            <button
                              onClick={() => setConfirmFd(null)}
                              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmFd(fd.id)}
                            className="text-slate-300 hover:text-red-400 transition-colors"
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

      {/* Analize Başla */}
      {entity.financialData.length > 0 && (
        <div className="flex justify-end">
          <Link
            href={`/dashboard/analiz?entityId=${entity.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-80 transition-opacity"
            style={{ background: '#0B3C5D' }}
          >
            <BarChart3 size={13} />
            Analize Başla
          </Link>
        </div>
      )}

      {/* TDHP Bilanço & Gelir Tablosu Spreadsheet */}
      <TdhpSpreadsheet
        entityId={id}
        data={entity.financialData as unknown as Parameters<typeof TdhpSpreadsheet>[0]['data']}
        onRefresh={reload}
      />
    </div>
    </>
  )
}
