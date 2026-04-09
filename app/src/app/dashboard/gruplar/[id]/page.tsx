'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Plus, X, Loader2 } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

interface Entity {
  id: string
  name: string
  entityType: string
  ownershipPct: number | null
  sector: string | null
}

interface Group {
  id: string
  name: string
  baseCurrency: string
  entities: Entity[]
}

interface AllEntity {
  id: string
  name: string
  groupId: string | null
}

const ENTITY_TYPES = [
  { value: 'PARENT',     label: 'Ana Şirket' },
  { value: 'SUBSIDIARY', label: 'Bağlı Ortaklık' },
  { value: 'JV',         label: 'Ortak Girişim' },
]

export default function GrupDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [group, setGroup]       = useState<Group | null>(null)
  const [allEntities, setAll]   = useState<AllEntity[]>([])
  const [loading, setLoading]   = useState(true)
  const [addId, setAddId]       = useState('')
  const [addType, setAddType]   = useState('SUBSIDIARY')
  const [addOwn, setAddOwn]     = useState('100')
  const [adding, setAdding]     = useState(false)

  const load = useCallback(async () => {
    const [gr, en] = await Promise.all([
      fetch(`/api/groups/${id}`).then((r) => r.json()),
      fetch('/api/entities').then((r) => r.json()),
    ])
    setGroup(gr.group)
    setAll(en.entities ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Grupta olmayan şirketler
  const available = allEntities.filter(
    (e) => !e.groupId && !group?.entities.some((ge) => ge.id === e.id)
  )

  async function addEntity() {
    if (!addId) return
    setAdding(true)
    const res = await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addEntityId: addId,
        entityType:  addType,
        ownershipPct: Number(addOwn) / 100,
      }),
    })
    const d = await res.json()
    if (res.ok) setGroup(d.group)
    setAddId('')
    setAdding(false)
  }

  async function removeEntity(entityId: string) {
    await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeEntityId: entityId }),
    })
    setGroup((prev) => prev
      ? { ...prev, entities: prev.entities.filter((e) => e.id !== entityId) }
      : prev
    )
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
  if (!group)  return <p className="text-white/50">Grup bulunamadı.</p>

  return (
    <DashboardShell>
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/gruplar" className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">{group.name}</h1>
          <p className="text-white/40 text-xs mt-0.5">{group.entities.length} şirket · {group.baseCurrency}</p>
        </div>
      </div>

      {/* Şirket ekle */}
      {available.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Şirket Ekle</p>
          <div className="flex flex-wrap gap-3">
            <select value={addId} onChange={(e) => setAddId(e.target.value)}
              className="flex-1 min-w-[160px] px-3 py-2 bg-navy-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">— Şirket seçin —</option>
              {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select value={addType} onChange={(e) => setAddType(e.target.value)}
              className="px-3 py-2 bg-navy-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            >
              {ENTITY_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input type="number" value={addOwn} onChange={(e) => setAddOwn(e.target.value)}
                min={1} max={100} className="w-16 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
              <span className="text-white/40 text-sm">%</span>
            </div>
            <button onClick={addEntity} disabled={!addId || adding}
              className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Ekle
            </button>
          </div>
        </div>
      )}

      {/* Mevcut şirketler */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Grup Şirketleri</p>
        </div>
        {group.entities.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 size={28} className="text-white/20 mx-auto mb-2" />
            <p className="text-white/30 text-sm">Gruba henüz şirket eklenmedi.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {group.entities.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <Building2 size={16} className="text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/sirketler/${e.id}`}
                    className="text-sm font-medium text-white hover:text-cyan-400 transition-colors"
                  >
                    {e.name}
                  </Link>
                  {e.sector && <p className="text-xs text-white/30 mt-0.5">{e.sector}</p>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50">
                  {e.entityType === 'PARENT' ? 'Ana' : e.entityType === 'JV' ? 'OG' : 'Bağlı'}
                </span>
                {e.ownershipPct != null && (
                  <span className="text-xs font-medium text-cyan-400">
                    %{(Number(e.ownershipPct) * 100).toFixed(0)}
                  </span>
                )}
                <button onClick={() => removeEntity(e.id)}
                  className="p-1 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </DashboardShell>
  )
}
