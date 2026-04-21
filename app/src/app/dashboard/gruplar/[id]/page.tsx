'use client'

import React, { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Plus, X, Loader2,
  AlertTriangle, BarChart3, Save, GitBranch,
} from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface GroupInfo {
  id:     string
  name:   string
  sector: string
}

interface EntityInfo {
  id:           string
  name:         string
  ownershipPct: number   // 0–100
  totalAssets:  number
  latestAnalysis: { finalScore: number; grade: string } | null
}

interface ConsolidatedResult {
  consolidatedScore:    number
  consolidatedGrade:    string
  weightedAverageScore: number
  weakestLinkApplied:   boolean
  liquidityScore:       number
  profitabilityScore:   number
  leverageScore:        number
  activityScore:        number
}

interface EliminationsData {
  intercompanySales:            number
  intercompanyPurchases:        number
  intercompanyReceivables:      number
  intercompanyPayables:         number
  intercompanyAdvancesGiven:    number
  intercompanyAdvancesReceived: number
  intercompanyProfit:           number
}

interface AllEntity { id: string; name: string; groupId: string | null }

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const ZERO_ELIM: EliminationsData = {
  intercompanySales:            0,
  intercompanyPurchases:        0,
  intercompanyReceivables:      0,
  intercompanyPayables:         0,
  intercompanyAdvancesGiven:    0,
  intercompanyAdvancesReceived: 0,
  intercompanyProfit:           0,
}

const ENTITY_TYPES = [
  { value: 'PARENT',     label: 'Ana Şirket' },
  { value: 'SUBSIDIARY', label: 'Bağlı Ortaklık' },
  { value: 'JV',         label: 'Grup Şirketi' },
]

const RATING_LABEL: Record<string, string> = {
  AAA: 'Mükemmel', AA: 'Yüksek', A: 'İyi', BBB: 'Yeterli',
  BB: 'Spekülatif', B: 'Riskli', CCC: 'Çok Riskli', CC: 'Kritik', C: 'Kritik', D: 'Temerrüt',
}

const ELIM_FIELDS: { key: keyof EliminationsData; label: string; hint: string }[] = [
  { key: 'intercompanySales',            label: 'Grup İçi Satışlar',             hint: 'Gelir tablosundan düşülür' },
  { key: 'intercompanyPurchases',        label: 'Grup İçi Alışlar',              hint: 'Satışların maliyetinden düşülür' },
  { key: 'intercompanyReceivables',      label: 'Grup İçi Ticari Alacaklar',     hint: 'Aktiften düşülür' },
  { key: 'intercompanyPayables',         label: 'Grup İçi Ticari Borçlar',       hint: 'Pasiften düşülür' },
  { key: 'intercompanyAdvancesGiven',    label: 'Verilen Grup İçi Avanslar',     hint: 'Aktiften düşülür' },
  { key: 'intercompanyAdvancesReceived', label: 'Alınan Grup İçi Avanslar',      hint: 'Pasiften düşülür' },
  { key: 'intercompanyProfit',           label: 'Grup İçi Gerçekleşmemiş Kâr',  hint: 'Stok/aktif ve özkaynak düşülür' },
]

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function fmtAsset(v: number): string {
  if (v <= 0) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} Mr`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} Mn`
  return new Intl.NumberFormat('tr-TR').format(Math.round(v))
}

function gradeColor(grade: string): string {
  if (['AAA', 'AA', 'A'].includes(grade)) return '#16a34a'
  if (['BBB', 'BB'].includes(grade)) return '#0B3C5D'
  if (grade === 'B') return '#D97706'
  return '#DC2626'
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function GrupDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [activeTab, setActiveTab] = useState<'firmalar' | 'rating' | 'eliminasyonlar'>('firmalar')

  // Veri
  const [group,        setGroup]        = useState<GroupInfo | null>(null)
  const [entities,     setEntities]     = useState<EntityInfo[]>([])
  const [consolidated, setConsolidated] = useState<ConsolidatedResult | null>(null)
  const [eliminations, setEliminations] = useState<EliminationsData>(ZERO_ELIM)
  const [allEntities,  setAll]          = useState<AllEntity[]>([])
  const [loading,      setLoading]      = useState(true)

  // Şirket ekleme formu
  const [addId,   setAddId]   = useState('')
  const [addType, setAddType] = useState('SUBSIDIARY')
  const [addOwn,  setAddOwn]  = useState('100')
  const [adding,  setAdding]  = useState(false)

  // Eliminasyon formu
  const [elimForm,   setElimForm]   = useState<EliminationsData>(ZERO_ELIM)
  const [savingElim, setSavingElim] = useState(false)
  const [elimSaved,  setElimSaved]  = useState(false)

  // ── Yükle ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [groupRes, allRes] = await Promise.all([
      fetch(`/api/groups/${id}`).then(r => r.json()),
      fetch('/api/entities').then(r => r.json()),
    ])
    if (groupRes.group) {
      setGroup(groupRes.group)
      setEntities(groupRes.entities ?? [])
      setConsolidated(groupRes.consolidated ?? null)
      const elim: EliminationsData = groupRes.eliminations ?? ZERO_ELIM
      setEliminations(elim)
      setElimForm(elim)
    }
    setAll(allRes.entities ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  // ── Şirket işlemleri ─────────────────────────────────────────────────────
  const available = allEntities.filter(
    e => !e.groupId && !entities.some(ge => ge.id === e.id)
  )

  async function addEntity() {
    if (!addId) return
    setAdding(true)
    await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addEntityId: addId, entityType: addType, ownershipPct: Number(addOwn) / 100 }),
    })
    setAddId('')
    setAdding(false)
    await loadData()
  }

  async function removeEntity(entityId: string) {
    await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeEntityId: entityId }),
    })
    await loadData()
  }

  // ── Eliminasyon kaydet ────────────────────────────────────────────────────
  async function saveEliminations() {
    setSavingElim(true)
    const res = await fetch(`/api/groups/${id}/eliminations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(elimForm),
    })
    if (res.ok) {
      setElimSaved(true)
      await loadData()
      setTimeout(() => setElimSaved(false), 3000)
    }
    setSavingElim(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <DashboardShell>
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin" style={{ color: '#2EC4B6' }} />
      </div>
    </DashboardShell>
  )

  if (!group) return (
    <DashboardShell>
      <p style={{ color: '#94A3B8' }}>Grup bulunamadı.</p>
    </DashboardShell>
  )

  return (
    <DashboardShell>
    <div className="space-y-6">

      {/* ── Başlık ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/gruplar" className="text-gray-400 hover:text-[#0B3C5D] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#0B3C5D]">{group.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            {entities.length} şirket{group.sector ? ` · ${group.sector}` : ''}
          </p>
        </div>
        {/* Mini skor özeti sağda */}
        {consolidated && (
          <div className="text-right flex-shrink-0">
            <p style={{ fontSize: 28, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#0B3C5D', lineHeight: 1 }}>
              {Math.round(consolidated.consolidatedScore)}
            </p>
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold mt-0.5"
              style={{ background: '#0B3C5D', color: '#fff' }}>
              {consolidated.consolidatedGrade}
            </span>
          </div>
        )}
      </div>

      {/* ── Ana sekmeler ───────────────────────────────────────────────────── */}
      <div className="tab-group inline-flex">
        {([
          { key: 'firmalar',       label: 'Firmalar',          Icon: Building2    },
          { key: 'rating',         label: 'Konsolide Rating',  Icon: BarChart3    },
          { key: 'eliminasyonlar', label: 'Eliminasyonlar',    Icon: GitBranch    },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`tab flex items-center gap-1.5 px-4 py-2 text-sm${activeTab === key ? ' active' : ''}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 1 — FİRMALAR
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'firmalar' && (
        <div className="max-w-2xl space-y-4">

          {/* Şirket ekleme formu — sadece uygun şirket varsa */}
          {available.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-head"><h2 className="card-title text-sm">Şirket Ekle</h2></div>
              <div className="card-body">
                <div className="flex flex-wrap gap-3">
                  <select value={addId} onChange={e => setAddId(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    <option value="">— Şirket seçin —</option>
                    {available.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <select value={addType} onChange={e => setAddType(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500">
                    {ENTITY_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" value={addOwn} onChange={e => setAddOwn(e.target.value)}
                      min={1} max={100}
                      className="w-16 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500" />
                    <span className="text-gray-400 text-sm">%</span>
                  </div>
                  <button onClick={addEntity} disabled={!addId || adding}
                    className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ekle
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Firma listesi */}
          <div className="card overflow-hidden">
            <div className="card-head"><h2 className="card-title text-sm">Grup Firmaları</h2></div>
            {entities.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 size={28} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>Gruba henüz şirket eklenmedi.</p>
              </div>
            ) : (
              <>
                {/* Tablo başlığı */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 72px 100px 88px 32px',
                  gap: 8, padding: '8px 20px',
                  borderBottom: '1px solid #F1F5F9',
                  background: '#F8FAFC',
                }}>
                  {['FİRMA', 'SKOR', 'DERECELENDİRME', 'AKTİF', ''].map((h, i) => (
                    <span key={i} style={{
                      fontSize: 10, fontWeight: 600, color: '#94A3B8',
                      textAlign: i > 0 ? 'right' : 'left',
                      letterSpacing: '0.06em',
                    }}>{h}</span>
                  ))}
                </div>

                <div className="divide-y divide-[#F1F5F9]">
                  {entities.map(e => (
                    <div key={e.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 72px 100px 88px 32px',
                      gap: 8, padding: '10px 20px',
                      alignItems: 'center',
                    }}>
                      {/* Firma adı */}
                      <div className="min-w-0">
                        <Link href={`/dashboard/sirketler/${e.id}`}
                          className="text-sm font-medium text-[#0B3C5D] hover:underline block truncate">
                          {e.name}
                        </Link>
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                          %{Math.round(e.ownershipPct)} sahiplik
                        </p>
                      </div>

                      {/* Skor */}
                      <div style={{ textAlign: 'right' }}>
                        {e.latestAnalysis ? (
                          <span style={{
                            fontSize: 18, fontWeight: 900,
                            fontFamily: 'Outfit, sans-serif', color: '#0B3C5D',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {Math.round(e.latestAnalysis.finalScore)}
                          </span>
                        ) : <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>}
                      </div>

                      {/* Grade badge */}
                      <div style={{ textAlign: 'right' }}>
                        {e.latestAnalysis ? (
                          <span style={{
                            display: 'inline-flex', padding: '2px 8px', borderRadius: 6,
                            fontSize: 11, fontWeight: 700,
                            background: `${gradeColor(e.latestAnalysis.grade)}18`,
                            color: gradeColor(e.latestAnalysis.grade),
                          }}>
                            {e.latestAnalysis.grade}
                          </span>
                        ) : <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>}
                      </div>

                      {/* Toplam Aktif */}
                      <div style={{ textAlign: 'right', fontSize: 12, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtAsset(e.totalAssets)}
                      </div>

                      {/* Çıkar */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => removeEntity(e.id)}
                          style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#CBD5E1', transition: 'color 0.15s' }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = '#f87171')}
                          onMouseLeave={ev => (ev.currentTarget.style.color = '#CBD5E1')}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 2 — KONSOLİDE RATING
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'rating' && (
        <div className="max-w-xl space-y-4">

          {!consolidated ? (
            <div className="card p-10 text-center">
              <BarChart3 size={32} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>
                Konsolide skor hesaplanamadı.
              </p>
              <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>
                Gruba analizi tamamlanmış şirket ekleyin.
              </p>
            </div>
          ) : (
            <>
              {/* En zayıf halka uyarısı */}
              {consolidated.weakestLinkApplied && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 16px', borderRadius: 12,
                  background: '#FFFBEB', border: '1px solid #FDE68A',
                }}>
                  <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: '#B45309', margin: 0 }}>
                    <strong>En zayıf halka guardrail uygulandı</strong> — grup içinde CCC altı (skor &lt; 44) firma var. Konsolide skor 60 ile sınırlandırıldı.
                  </p>
                </div>
              )}

              {/* Ana skor kartı */}
              <div className="card overflow-hidden">
                <div className="card-head" style={{ background: '#F8FAFC' }}>
                  <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                    KONSOLİDE GRUP SKORU
                  </h2>
                </div>
                <div className="card-body">
                  <div className="flex items-end gap-6">
                    {/* Büyük skor */}
                    <div>
                      <p style={{
                        fontSize: 80, fontWeight: 900,
                        fontFamily: 'Outfit, sans-serif',
                        color: '#0B3C5D', lineHeight: 1,
                      }}>
                        {Math.round(consolidated.consolidatedScore)}
                      </p>
                      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>/100</p>
                    </div>

                    {/* Grade */}
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{
                        display: 'inline-flex', padding: '4px 14px', borderRadius: 8,
                        fontSize: 16, fontWeight: 800, background: '#0B3C5D', color: '#fff',
                      }}>
                        {consolidated.consolidatedGrade}
                      </div>
                      <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                        {RATING_LABEL[consolidated.consolidatedGrade] ?? ''}
                      </p>
                    </div>
                  </div>

                  {/* Ağırlıklı ortalama */}
                  <div style={{
                    marginTop: 16, paddingTop: 16,
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <p style={{ fontSize: 12, color: '#64748B' }}>Ağırlıklı ortalama (aktif bazlı):</p>
                    <span style={{
                      fontSize: 16, fontWeight: 800,
                      fontFamily: 'Outfit, sans-serif', color: '#5A7A96',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {consolidated.weightedAverageScore.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Kategori skoru */}
              <div className="card overflow-hidden">
                <div className="card-head" style={{ background: '#F8FAFC' }}>
                  <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                    KATEGORİ SKORLARI
                  </h2>
                </div>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {([
                      { label: 'Likidite',  value: consolidated.liquidityScore,     weight: '%25' },
                      { label: 'Kârlılık',  value: consolidated.profitabilityScore, weight: '%30' },
                      { label: 'Kaldıraç',  value: consolidated.leverageScore,      weight: '%30' },
                      { label: 'Faaliyet',  value: consolidated.activityScore,      weight: '%15' },
                    ] as const).map(({ label, value, weight }) => (
                      <div key={label} style={{
                        borderRadius: 12, padding: '14px 16px',
                        background: '#F8FAFC', border: '1px solid #E5E9F0',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>{label}</span>
                          <span style={{ fontSize: 10, color: '#CBD5E1' }}>{weight}</span>
                        </div>
                        <p style={{
                          fontSize: 34, fontWeight: 900,
                          fontFamily: 'Outfit, sans-serif',
                          color: '#0B3C5D', lineHeight: 1,
                        }}>
                          {Math.round(value)}
                        </p>
                        {/* Progress bar */}
                        <div style={{ marginTop: 8, height: 5, borderRadius: 99, background: '#E5E9F0' }}>
                          <div style={{
                            height: '100%', borderRadius: 99,
                            width: `${Math.min(100, Math.max(0, value))}%`,
                            background: 'linear-gradient(90deg, #2EC4B6 0%, #0B3C5D 100%)',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SEKME 3 — ELİMİNASYONLAR
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'eliminasyonlar' && (
        <div className="max-w-xl space-y-4">

          {/* Bilgi banner */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 16px', borderRadius: 12,
            background: '#EDF4F8', border: '1px solid rgba(11,60,93,0.12)',
          }}>
            <GitBranch size={14} style={{ color: '#0B3C5D', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: '#0B3C5D', margin: 0 }}>
              Grup içi işlem eliminasyonları konsolide finansal tablolardan düşülür.
              Kaydedildiğinde konsolide skor otomatik olarak yeniden hesaplanır.
            </p>
          </div>

          {/* Form */}
          <div className="card overflow-hidden">
            <div className="card-head">
              <h2 className="card-title text-sm">Grup İçi Eliminasyonlar</h2>
            </div>
            <div className="card-body space-y-4">
              {ELIM_FIELDS.map(({ key, label, hint }) => (
                <div key={key} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 160px',
                  gap: 12, alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1E293B', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{hint}</p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={elimForm[key]}
                    onChange={ev => setElimForm(prev => ({ ...prev, [key]: Number(ev.target.value) || 0 }))}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-right text-[#1E293B] tabular-nums focus:outline-none focus:border-cyan-500"
                  />
                </div>
              ))}

              {/* Kaydet */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: 12, borderTop: '1px solid #F1F5F9',
              }}>
                {elimSaved ? (
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>
                    ✓ Kaydedildi — konsolide skor yeniden hesaplandı
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: '#94A3B8' }}>
                    Tüm alanlar TL cinsinden girilmelidir.
                  </p>
                )}
                <button
                  onClick={saveEliminations}
                  disabled={savingElim}
                  className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                  {savingElim
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Save size={14} />
                  }
                  Kaydet
                </button>
              </div>
            </div>
          </div>

          {/* Mevcut eliminasyon özeti */}
          {Object.values(eliminations).some(v => v > 0) && (
            <div className="card overflow-hidden">
              <div className="card-head" style={{ background: '#F8FAFC' }}>
                <h2 className="card-title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0B3C5D' }}>
                  KAYITLI ELİMİNASYONLAR
                </h2>
              </div>
              <div className="divide-y divide-[#F1F5F9]">
                {ELIM_FIELDS.filter(f => eliminations[f.key] > 0).map(({ key, label }) => (
                  <div key={key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 20px',
                  }}>
                    <span style={{ fontSize: 12, color: '#1E293B' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                      -{fmtAsset(eliminations[key])} TL
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
    </DashboardShell>
  )
}
