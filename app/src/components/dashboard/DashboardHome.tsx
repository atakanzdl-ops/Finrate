'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import FinrateShell from '@/components/layout/FinrateShell'
import EntityRatingCard, {
  groupAnalysesByEntity,
  sortEntitiesByLatest,
  latestAnalysisPeriodLabel,
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
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)

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
    // updatedAt API'den {} geliyor (jsonUtf8 Date→{} hatası); year+period güvenilir
    const lastPeriod = latestAnalysisPeriodLabel(analyses as CardAnalysisItem[]) ?? '—'
    return `${entityGroups.length} firma • Son dönem: ${lastPeriod}`
  }, [analyses, entityGroups.length])

  return (
    <FinrateShell>
      <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Finansal Kontrol Paneli</h1>
            <p>{subtitle}</p>
          </div>
        </div>

        {loading ? (
          <div className="card p-16 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#0B3C5D]" size={28} />
          </div>
        ) : (
          <>
            {entityGroups.length === 0 ? (
              <div className="card p-16 text-center text-slate-500">
                Yeni şirket eklemek için{' '}
                <Link
                  href="/dashboard/sirketler"
                  className="text-[#0B3C5D] font-semibold hover:underline"
                >
                  Şirketler sayfasındaki + Yeni Şirket
                </Link>{' '}
                butonunu kullanın.
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
    </FinrateShell>
  )
}
