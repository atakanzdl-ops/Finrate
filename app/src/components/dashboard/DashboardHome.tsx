'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CalendarClock,
  Loader2,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import FinrateShell from '@/components/layout/FinrateShell'

interface Analysis {
  id: string
  year: number
  period: string
  updatedAt: string
  finalScore: number
  finalRating: string
  entity?: { id: string; name: string; sector?: string | null }
}

const SECTORS = [
  'Üretim',
  'Ticaret',
  'Hizmet',
  'İnşaat',
  'Turizm',
  'Tarım',
  'Enerji',
  'Sağlık',
  'Eğitim',
  'Finans',
  'Teknoloji',
  'Diğer',
]

function toValidDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value?: string | null) {
  const date = toValidDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function ratingTone(rating: string) {
  if (['AAA', 'AA', 'A'].includes(rating)) return 'text-emerald-600 bg-emerald-50 border-emerald-100'
  if (rating === 'BBB') return 'text-amber-700 bg-amber-50 border-amber-100'
  return 'text-red-600 bg-red-50 border-red-100'
}

export default function DashboardHome() {
  const router = useRouter()
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewAnalysis, setShowNewAnalysis] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [entityName, setEntityName] = useState('')
  const [sector, setSector] = useState('')

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((d) => {
        const list = (d.analyses ?? []) as Analysis[]
        setAnalyses(
          [...list].sort((a, b) => {
            const aTime = toValidDate(a.updatedAt)?.getTime() ?? 0
            const bTime = toValidDate(b.updatedAt)?.getTime() ?? 0
            return bTime - aTime
          }),
        )
      })
      .catch(() => setAnalyses([]))
      .finally(() => setLoading(false))
  }, [])

  const latest = analyses[0] ?? null
  const previous = analyses[1] ?? null
  const change = latest && previous ? latest.finalScore - previous.finalScore : null

  const subtitle = useMemo(() => {
    if (!latest) return 'Henüz analiz bulunmuyor.'
    return `${latest.entity?.name ?? 'Şirket'} • Son analiz: ${formatDate(latest.updatedAt)}`
  }, [latest])

  async function handleCreateAnalysis(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')

    if (!entityName.trim()) {
      setCreateError('Şirket adı zorunludur.')
      return
    }
    if (!sector) {
      setCreateError('Sektör seçimi zorunludur.')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: entityName.trim(), sector }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error ?? 'Şirket oluşturulamadı.')
        return
      }
      const entityId = data?.entity?.id as string | undefined
      if (!entityId) {
        setCreateError('Şirket kimliği alınamadı.')
        return
      }
      setShowNewAnalysis(false)
      router.push(`/dashboard/analiz/yukle/${entityId}`)
    } catch {
      setCreateError('Bağlantı hatası. Lütfen tekrar deneyin.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <FinrateShell>
      <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Finansal Kontrol Paneli</h1>
            <p>{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewAnalysis(true)}
            className="btn btn-primary"
          >
            <Plus size={16} />
            Yeni Analiz Başlat
          </button>
        </div>

        {loading ? (
          <div className="card p-16 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#0B3C5D]" size={28} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card p-6 md:col-span-2">
                <p className="text-xs text-slate-500 tracking-widest font-bold">SKOR / RATING</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-5xl font-black text-[#0B3C5D]">{latest ? Math.round(latest.finalScore) : '-'}</span>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${latest ? ratingTone(latest.finalRating) : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                    {latest?.finalRating ?? '—'}
                  </span>
                </div>
              </div>

              <div className="card p-6">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Son Analiz Tarihi</p>
                <div className="mt-3 flex items-center gap-2 text-[#0B3C5D]">
                  <CalendarClock size={18} />
                  <span className="font-bold text-lg">{latest ? formatDate(latest.updatedAt) : '—'}</span>
                </div>
              </div>

              <div className="card p-6">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Son Değişim</p>
                <div className="mt-3 flex items-center gap-2">
                  {change == null ? (
                    <span className="text-slate-500 font-bold text-lg">—</span>
                  ) : change >= 0 ? (
                    <>
                      <TrendingUp size={18} className="text-emerald-600" />
                      <span className="text-emerald-600 font-bold text-lg">+{change.toFixed(1)} puan</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown size={18} className="text-red-600" />
                      <span className="text-red-600 font-bold text-lg">{change.toFixed(1)} puan</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2 className="card-title">Analiz Geçmişi</h2>
              </div>
              <div className="card-body">
                {analyses.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    İlk analiz için <strong>Yeni Analiz Başlat</strong> butonunu kullanın.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {analyses.slice(0, 9).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => router.push(`/dashboard/analiz?entityId=${item.entity?.id ?? ''}`)}
                        className="text-left p-4 rounded-xl border border-[#E5E9F0] hover:border-[#0B3C5D]/25 hover:bg-[#F8FAFC] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#1E293B]">{item.entity?.name ?? 'Şirket'}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ratingTone(item.finalRating)}`}>
                            {item.finalRating}
                          </span>
                        </div>
                        <div className="mt-3 text-2xl font-black text-[#0B3C5D]">{Math.round(item.finalScore)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(item.updatedAt)} • {item.year}/{item.period}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => router.push('/dashboard/analiz')}
              >
                Tüm Analizleri Gör <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {showNewAnalysis && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white border border-[#E5E9F0] rounded-xl shadow-xl">
            <div className="px-6 py-5 border-b border-[#E5E9F0]">
              <h3 className="text-lg font-black text-[#0B3C5D]">Yeni Analiz Başlat</h3>
              <p className="text-sm text-slate-500 mt-1">Şirket bilgilerini girin, ardından doğrudan mali veri yükleme ekranına geçin.</p>
            </div>
            <form onSubmit={handleCreateAnalysis} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Şirket Adı</label>
                <input
                  type="text"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm outline-none focus:border-[#0B3C5D]"
                  placeholder="Örn: ABC Tekstil A.Ş."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Sektör</label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm outline-none focus:border-[#0B3C5D] bg-white"
                >
                  <option value="">Sektör seçin</option>
                  {SECTORS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              {createError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (creating) return
                    setShowNewAnalysis(false)
                    setCreateError('')
                  }}
                >
                  Vazgeç
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                  Kaydet ve Devam Et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </FinrateShell>
  )
}
