'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, Loader2, Upload, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { FileUpload } from '@/components/analysis/FileUpload'
import DashboardShell from '@/components/layout/DashboardShell'
import { TdhpSpreadsheet } from '@/components/analysis/TdhpSpreadsheet'

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
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-3 py-2 glass border border-white/10 hover:border-cyan-500/30 rounded-lg text-xs font-semibold text-white/70 hover:text-white transition-all"
          >
            <Upload size={14} />
            Excel / PDF
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

      {/* Dönem Özet Tablosu — veri yoksa başlık + boş satır, yapı değişmez */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-white/50 font-medium text-xs">Dönem</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Ciro</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">FAVÖK / FVÖK</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Net Kar</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Toplam Varlık</th>
                <th className="text-right px-4 py-3 text-white/50 font-medium text-xs">Öz Kaynak</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entity.financialData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-white/30 text-xs">
                    Henüz finansal veri girilmedi. Excel veya PDF yükleyin.
                  </td>
                </tr>
              ) : entity.financialData.map((fd) => (
                  <tr key={fd.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white">{fd.year}</span>
                      <span className="ml-2 text-xs text-white/40">{PERIOD_LABELS[fd.period]}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.revenue)}</td>
                    <td className="px-4 py-3 text-right text-white/80">
                      {fd.ebitda != null
                        ? <>{fmt(fd.ebitda)} <span className="text-[10px] text-white/30">FAVÖK</span></>
                        : fd.ebit != null
                          ? <>{fmt(fd.ebit)} <span className="text-[10px] text-white/30">FVÖK</span></>
                          : '—'
                      }
                    </td>
                    <td className={clsx('px-4 py-3 text-right', fd.netProfit != null && fd.netProfit < 0 ? 'text-red-400' : 'text-white/80')}>
                      {fmt(fd.netProfit)}
                    </td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.totalAssets)}</td>
                    <td className="px-4 py-3 text-right text-white/80">{fmt(fd.totalEquity)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
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

      {/* Analize Başla */}
      {entity.financialData.length > 0 && (
        <div className="flex justify-end">
          <Link
            href={`/dashboard/analiz?entityId=${entity.id}`}
            className="flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-lg text-sm font-semibold text-white"
          >
            <BarChart3 size={16} />
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
    </DashboardShell>
  )
}
