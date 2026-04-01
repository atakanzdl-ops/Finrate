'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { GitBranch, Plus, Building2, ChevronRight, Loader2, Trash2 } from 'lucide-react'

interface Entity {
  id: string
  name: string
  entityType: string
  ownershipPct: number | null
}

interface Group {
  id: string
  name: string
  baseCurrency: string
  createdAt: string
  entities: Entity[]
  _count: { entities: number }
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  STANDALONE: 'Bağımsız', PARENT: 'Ana', SUBSIDIARY: 'Bağlı', JV: 'OG',
}

export default function GruplarPage() {
  const [groups, setGroups]     = useState<Group[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    const res = await fetch('/api/groups')
    const d = await res.json()
    setGroups(d.groups ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createGroup() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const d = await res.json()
    if (res.ok) {
      setGroups((prev) => [{ ...d.group, entities: [], _count: { entities: 0 } }, ...prev])
      setNewName('')
      setShowForm(false)
    }
    setCreating(false)
  }

  async function deleteGroup(id: string) {
    if (!confirm('Bu grubu silmek istediğinizden emin misiniz?\nGruptaki şirketler bağımsız hale gelecek.')) return
    await fetch(`/api/groups/${id}`, { method: 'DELETE' })
    setGroups((prev) => prev.filter((g) => g.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gruplar</h1>
          <p className="text-white/50 text-sm mt-0.5">Konsolide analiz için şirket grupları</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Yeni Grup
        </button>
      </div>

      {/* Yeni grup formu */}
      {showForm && (
        <div className="glass-card rounded-xl p-4 flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createGroup()}
            placeholder="Grup adı (örn: ABC Holding)"
            autoFocus
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={createGroup}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            Oluştur
          </button>
          <button
            onClick={() => setShowForm(false)}
            className="px-3 py-2 text-white/40 hover:text-white transition-colors text-sm"
          >
            İptal
          </button>
        </div>
      )}

      {/* Grup listesi */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <GitBranch size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Henüz grup oluşturulmadı.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="glass-card rounded-xl overflow-hidden">
              {/* Grup başlığı */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                  <GitBranch size={16} className="text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{group.name}</p>
                  <p className="text-xs text-white/40">{group._count.entities} şirket · {group.baseCurrency}</p>
                </div>
                <Link
                  href={`/dashboard/gruplar/${group.id}`}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  Yönet <ChevronRight size={12} />
                </Link>
                <button
                  onClick={() => deleteGroup(group.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Şirketler */}
              {group.entities.length > 0 ? (
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {group.entities.map((e) => (
                    <Link
                      key={e.id}
                      href={`/dashboard/sirketler/${e.id}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <Building2 size={12} className="text-white/40" />
                      <span className="text-xs text-white/70">{e.name}</span>
                      <span className="text-xs text-white/30">{ENTITY_TYPE_LABELS[e.entityType]}</span>
                      {e.ownershipPct != null && (
                        <span className="text-xs text-cyan-400">{(Number(e.ownershipPct) * 100).toFixed(0)}%</span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-xs text-white/30">Henüz şirket eklenmedi.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
