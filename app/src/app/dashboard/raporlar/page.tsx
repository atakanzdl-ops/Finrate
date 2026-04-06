'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { FileText, ExternalLink, Loader2, Building2 } from 'lucide-react'
import clsx from 'clsx'
import DashboardShell from '@/components/layout/DashboardShell'

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
  BBB: 'text-lime-400',    BB: 'text-yellow-400',  B: 'text-orange-400',
  CCC: 'text-orange-500',  CC: 'text-red-400',     C: 'text-red-500', D: 'text-red-600',
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
  const router = useRouter()

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
    <DashboardShell>
      <div className="space-y-6 max-w-[1200px] mx-auto">

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-white tracking-tight font-display">Raporlar</h1>
          <button
            onClick={() => router.push('/dashboard/analiz')}
            className="h-10 px-6 rounded-xl bg-cyan-500/10 text-cyan-400 text-xs font-bold border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
          >
            + Yeni Analiz
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-cyan-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] p-16 text-center"
            style={{ boxShadow: '0 8px 32px rgba(10,30,60,0.08), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
            <FileText size={40} className="text-slate-400 mx-auto mb-4" />
            <p className="text-[#3d5a80] font-bold text-sm mb-2">Henüz rapor oluşturulmadı</p>
            <p className="text-[#8da4bf] text-xs">Analiz sayfasından "Rapor Oluştur" butonuna tıklayın.</p>
          </div>
        ) : (
          <div className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] overflow-hidden"
            style={{ boxShadow: '0 8px 32px rgba(10,30,60,0.08), inset 0 1px 0 rgba(255,255,255,0.9)' }}>

            {/* Header */}
            <div className="px-8 py-5 border-b border-black/5 bg-white/20 grid grid-cols-12 text-[10px] font-black uppercase tracking-widest text-[#3d5a80]">
              <span className="col-span-5">Şirket</span>
              <span className="col-span-2 text-center">Not</span>
              <span className="col-span-2 text-center">Dönem</span>
              <span className="col-span-2 text-center">Tarih</span>
              <span className="col-span-1" />
            </div>

            {/* Rows */}
            <div className="divide-y divide-black/5">
              {reports.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="px-8 py-5 grid grid-cols-12 items-center hover:bg-white/30 transition-colors group cursor-pointer"
                  onClick={() => router.push(`/dashboard/analiz/rapor?id=${r.id}`)}
                >
                  {/* Şirket */}
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center flex-shrink-0">
                      <Building2 size={14} className="text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0a1727] leading-none mb-1">
                        {r.entity?.name ?? '—'}
                      </p>
                      <p className="text-[9px] font-bold text-[#8da4bf] uppercase tracking-wider">
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
                      <p className="text-[9px] font-bold text-[#8da4bf] mt-0.5">{Math.round(r.finalScore)} puan</p>
                    )}
                  </div>

                  {/* Dönem */}
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-bold text-[#3d5a80]">{r.year}</p>
                    <p className="text-[9px] font-bold text-[#8da4bf] uppercase tracking-wider mt-0.5">
                      {PERIOD_LABEL[r.period] ?? r.period}
                    </p>
                  </div>

                  {/* Tarih */}
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-bold text-[#3d5a80]">{fmtDate(r.reportedAt)}</p>
                  </div>

                  {/* Görüntüle */}
                  <div className="col-span-1 flex justify-end">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink size={13} className="text-cyan-400" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
