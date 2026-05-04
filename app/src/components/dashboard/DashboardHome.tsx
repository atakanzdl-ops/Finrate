'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import FinrateShell from '@/components/layout/FinrateShell'
import EntityRatingCard, {
  groupAnalysesByEntity,
  sortEntitiesByLatest,
  latestUpdatedAt,
  type CardAnalysisItem,
} from '@/components/dashboard/EntityRatingCard'

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

  const entityGroups = useMemo(
    () => sortEntitiesByLatest(groupAnalysesByEntity(analyses as CardAnalysisItem[])),
    [analyses],
  )

  const subtitle = useMemo(() => {
    if (!analyses.length) return 'Henüz analiz bulunmuyor.'
    const overallLatest = latestUpdatedAt(analyses as CardAnalysisItem[])
    return `${entityGroups.length} firma • Son güncelleme: ${formatDate(overallLatest)}`
  }, [analyses, entityGroups.length])

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
            {entityGroups.length === 0 ? (
              <div className="card p-16 text-center text-slate-500">
                İlk analiz için <strong>Yeni Analiz Başlat</strong> butonunu kullanın.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {entityGroups.map((g) => (
                  <EntityRatingCard
                    key={g.entity.id}
                    entity={g.entity}
                    analyses={g.analyses}
                  />
                ))}
              </div>
            )}
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
