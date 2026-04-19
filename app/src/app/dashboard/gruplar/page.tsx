'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { GitBranch, Plus, Building2, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

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
  STANDALONE: 'Bağımsız', PARENT: 'Ana', SUBSIDIARY: 'Bağlı', JV: 'GŞ',
}

export default function GruplarPage() {
  const [groups, setGroups]     = useState<Group[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      setError(null)
      const res = await fetch('/api/groups')
      if (res.status === 401) {
        window.location.href = '/giris'
        return
      }
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Gruplar yüklenemedi.')
      setGroups(d.groups ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gruplar yüklenemedi.')
      setGroups([])
    } finally {
      setLoading(false)
    }
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
    <DashboardShell>
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3C5D]">Gruplar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Konsolide analiz için şirket grupları</p>
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
            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] placeholder-gray-400 focus:outline-none focus:border-slate-400"
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
            className="px-3 py-2 text-gray-400 hover:text-[#0B3C5D] transition-colors text-sm"
          >
            İptal
          </button>
        </div>
      )}

      {/* Grup listesi */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[#2EC4B6]" />
        </div>
      ) : error ? (
        <div className="glass-card rounded-xl p-6">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <GitBranch size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Henüz grup oluşturulmadı.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="glass-card rounded-xl overflow-hidden">
              {/* Grup başlığı */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
                  <GitBranch size={16} style={{ color: '#2EC4B6' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0B3C5D]">{group.name}</p>
                  <p className="text-xs text-gray-400">{group._count.entities} şirket · {group.baseCurrency}</p>
                </div>
                <Link
                  href={`/dashboard/gruplar/${group.id}`}
                  className="text-xs flex items-center gap-1 font-medium transition-colors"
                  style={{ color: '#2EC4B6' }}
                >
                  Yönet <ChevronRight size={12} />
                </Link>
                <button
                  onClick={() => deleteGroup(group.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
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
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                      <Building2 size={12} className="text-gray-400" />
                      <span className="text-xs text-[#1E293B]">{e.name}</span>
                      <span className="text-xs text-gray-400">{ENTITY_TYPE_LABELS[e.entityType]}</span>
                      {e.ownershipPct != null && (
                        <span className="text-xs font-medium" style={{ color: '#2EC4B6' }}>
                          {(Number(e.ownershipPct) * 100).toFixed(0)}%
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400">Henüz şirket eklenmedi.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </DashboardShell>
  )
}
