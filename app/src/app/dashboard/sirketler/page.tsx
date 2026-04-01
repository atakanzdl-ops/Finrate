'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Building2, Plus, Search, ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Entity {
  id: string
  name: string
  taxNumber: string | null
  sector: string | null
  entityType: string
  createdAt: string
  group: { name: string } | null
  _count: { financialData: number }
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  STANDALONE: 'Bağımsız',
  PARENT:     'Ana Şirket',
  SUBSIDIARY: 'Bağlı Ortaklık',
  JV:         'Ortak Girişim',
}

export default function SirketlerPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    fetch('/api/entities')
      .then((r) => r.json())
      .then((d) => setEntities(d.entities ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = entities.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.taxNumber ?? '').includes(search) ||
    (e.sector ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Şirketler</h1>
          <p className="text-white/50 text-sm mt-0.5">{entities.length} kayıtlı şirket</p>
        </div>
        <Link
          href="/dashboard/sirketler/yeni"
          className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Yeni Şirket
        </Link>
      </div>

      {/* Arama */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Şirket adı, vergi no veya sektör..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <Building2 size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">
            {search ? 'Eşleşen şirket bulunamadı.' : 'Henüz şirket eklenmedi.'}
          </p>
          {!search && (
            <Link
              href="/dashboard/sirketler/yeni"
              className="inline-block mt-4 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white"
            >
              İlk Şirketi Ekle
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entity) => (
            <Link
              key={entity.id}
              href={`/dashboard/sirketler/${entity.id}`}
              className="glass-card flex items-center gap-4 p-4 rounded-xl hover:border-cyan-500/30 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Building2 size={18} className="text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{entity.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/50 flex-shrink-0">
                    {ENTITY_TYPE_LABELS[entity.entityType] ?? entity.entityType}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {entity.sector && (
                    <p className="text-xs text-white/40 truncate">{entity.sector}</p>
                  )}
                  {entity.taxNumber && (
                    <p className="text-xs text-white/30">VKN: {entity.taxNumber}</p>
                  )}
                  <p className="text-xs text-white/30">
                    {entity._count.financialData} dönem veri
                  </p>
                </div>
              </div>
              {entity.group && (
                <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 flex-shrink-0">
                  {entity.group.name}
                </span>
              )}
              <ChevronRight
                size={16}
                className={clsx('text-white/20 flex-shrink-0 transition-colors', 'group-hover:text-cyan-400')}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
