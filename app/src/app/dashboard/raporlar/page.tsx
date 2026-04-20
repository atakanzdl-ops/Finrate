'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { FileText, ExternalLink, Loader2, Building2, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import FinrateShell from '@/components/layout/FinrateShell'

interface Report {
  id: string
  year: number
  period: string
  finalScore: number | null
  finalRating: string | null
  reportedAt: string
  entity?: { id: string; name: string; sector?: string | null }
}

const RATING_COLOR: Record<string, string> = {
  AAA: 'text-emerald-400', AA: 'text-emerald-400', A: 'text-green-400',
  BBB: 'text-teal-400',    BB: 'text-slate-400',   B: 'text-red-400',
  CCC: 'text-red-500',     CC: 'text-red-500',     C: 'text-red-600', D: 'text-red-700',
}

const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Yıllık', Q1: '1. Çeyrek', Q2: '2. Çeyrek', Q3: '3. Çeyrek', Q4: '4. Çeyrek',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function RaporlarPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setDeletingId(id)
    await fetch('/api/raporlar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setReports(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  useEffect(() => {
    fetch('/api/raporlar')
      .then(r => {
        if (!r.ok) return { reports: [] }
        return r.json()
      })
      .then(d => setReports(d.reports ?? []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <FinrateShell>
      <div className="space-y-6 max-w-[1200px] mx-auto">

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-[#0B3C5D] tracking-tight">Raporlar</h1>
          <button
            onClick={() => router.push('/dashboard/analiz')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#0B3C5D' }}
          >
            + Yeni Analiz
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-cyan-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <FileText size={40} className="text-slate-300 mx-auto mb-4" />
            <p className="text-[#0B3C5D] font-bold text-sm mb-2">Henüz rapor oluşturulmadı</p>
            <p className="text-slate-400 text-xs">Analiz sayfasından &quot;Rapor Oluştur&quot; butonuna tıklayın.</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">

            {/* Header */}
            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/60 grid grid-cols-12 text-[10px] font-black uppercase tracking-widest text-[#5A7A96]">
              <span className="col-span-4">Şirket</span>
              <span className="col-span-2 text-center">Not</span>
              <span className="col-span-2 text-center">Dönem</span>
              <span className="col-span-2 text-center">Tarih</span>
              <span className="col-span-2" />
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100">
              {reports.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="px-8 py-4 grid grid-cols-12 items-center hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => router.push(`/dashboard/analiz/rapor?id=${r.id}`)}
                >
                  {/* Şirket */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(11,60,93,0.06)', border: '1px solid rgba(11,60,93,0.10)' }}>
                      <Building2 size={14} style={{ color: '#0B3C5D' }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0B3C5D] leading-none mb-1">
                        {r.entity?.name ?? '—'}
                      </p>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                        {r.entity?.sector ?? 'Genel'}
                      </p>
                    </div>
                  </div>

                  {/* Not */}
                  <div className="col-span-2 text-center">
                    <span className={clsx('text-lg font-black font-display', RATING_COLOR[r.finalRating ?? 'D'] ?? 'text-slate-400')}>
                      {r.finalRating ?? '—'}
                    </span>
                    {r.finalScore != null && (
                      <p className="text-[9px] font-semibold text-slate-400 mt-0.5">{Math.round(r.finalScore)} puan</p>
                    )}
                  </div>

                  {/* Dönem */}
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-semibold text-[#0B3C5D]">{r.year}</p>
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                      {PERIOD_LABEL[r.period] ?? r.period}
                    </p>
                  </div>

                  {/* Tarih */}
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-semibold text-[#5A7A96]">{fmtDate(r.reportedAt)}</p>
                  </div>

                  {/* Aksiyonlar */}
                  <div className="col-span-2 flex justify-end gap-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/dashboard/analiz/rapor?id=${r.id}`) }}
                      className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#EDF4F8]"
                      title="PDF Raporu Görüntüle"
                    >
                      <ExternalLink size={13} style={{ color: '#0B3C5D' }} />
                    </button>
                    <button
                      onClick={e => handleDelete(e, r.id)}
                      disabled={deletingId === r.id}
                      className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                      title="Raporu Sil"
                    >
                      {deletingId === r.id
                        ? <Loader2 size={13} className="text-red-400 animate-spin" />
                        : <Trash2 size={13} className="text-red-400" />}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </FinrateShell>
  )
}
