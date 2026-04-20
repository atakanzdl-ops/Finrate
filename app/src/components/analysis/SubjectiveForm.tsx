'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, Building2, CreditCard, AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react'
import clsx from 'clsx'
import type { SubjectiveInputData, SubjectiveBreakdown } from '@/lib/scoring/subjective'

interface Props {
  entityId: string
  onScoreChange?: (total: number) => void
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = (value / max) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] font-bold">
        <span className="text-[#5A7A96]">{label}</span>
        <span className="text-[#0B3C5D] font-mono">{value} / {max}</span>
      </div>
      <div className="ratio-bar-track">
        <div className="ratio-bar-fill transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function SwitchField({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
      <div>
        <div className="text-xs font-bold text-[#0B3C5D]">{label}</div>
        {desc && <div className="card-desc mt-0.5">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          "relative w-10 h-5 rounded-full transition-all duration-300 flex items-center",
          value ? "bg-cyan-500" : "bg-black/10"
        )}
      >
        <span className={clsx(
          "absolute w-4 h-4 rounded-full bg-white shadow transition-all duration-300",
          value ? "left-[22px]" : "left-0.5"
        )} />
      </button>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { val: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="card-desc uppercase tracking-widest">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.val}
            onClick={() => onChange(opt.val)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all",
              value === opt.val
                ? "bg-cyan-500 border-cyan-500 text-white shadow-md"
                : "border-slate-200 text-[#5A7A96] hover:border-cyan-400/50 hover:text-cyan-600"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <label className="card-desc uppercase tracking-widest">{label}</label>
        <span className="text-xs font-black text-[#0B3C5D] font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-cyan-500 h-1.5 rounded-full cursor-pointer"
      />
      <div className="flex justify-between text-[9px] text-[#94A3B8]">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

export default function SubjectiveForm({ entityId, onScoreChange }: Props) {
  const [data, setData] = useState<SubjectiveInputData>({
    kkbCategory: 'iyi',
    activeDelayDays: 0,
    checkProtest: false,
    enforcementFile: false,
    creditLimitUtilPct: 50,
    hasMultipleBanks: true,
    avgMaturityMonths: 24,
    companyAgeYears: 7,
    auditLevel: 'ymm',
    ownershipClarity: true,
    hasTaxDebt: false,
    hasSgkDebt: false,
    activeLawsuitCount: 0,
  })
  const [score, setScore] = useState<SubjectiveBreakdown | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/entities/${entityId}/subjective`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.subjectiveInput) setData(d.subjectiveInput)
        if (d?.score) setScore(d.score)
      })
      .finally(() => setLoading(false))
  }, [entityId])

  const update = useCallback((key: keyof SubjectiveInputData, val: unknown) => {
    setData(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/entities/${entityId}/subjective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const d = await res.json()
      if (d.score) {
        setScore(d.score)
        onScoreChange?.(d.score.total)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 size={20} className="animate-spin text-cyan-500" />
    </div>
  )

  const totalColor = score
    ? score.percentage >= 70 ? '#10b981'
    : score.percentage >= 40 ? '#94a3b8'
    : '#f87171'
    : '#94A3B8'

  return (
    <div className="space-y-6">
      <div className="card p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="card-title text-[10px] uppercase tracking-[0.3em]">Subjektif Değerlendirme</h3>
            <p className="card-desc mt-1">KKB · Banka · Kurumsal · Uyum — toplam 30 puan</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              "btn px-4 py-2 text-xs",
              saved
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                : "btn-primary"
            )}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
            {saved ? 'Kaydedildi' : 'Kaydet'}
          </button>
        </div>

        {score && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-black/5">
            <div className="text-center">
              <div className="text-3xl font-black font-mono" style={{ color: totalColor }}>{score.total}</div>
              <div className="card-desc uppercase tracking-widest mt-1">/ 30 PUAN</div>
            </div>
            <div className="col-span-3 space-y-3">
              <ScoreBar label="KKB & Kredi Sicili" value={score.kkbScore} max={10} color="#2dd4bf" />
              <ScoreBar label="Banka İlişkileri" value={score.bankScore} max={10} color="#0ea5e9" />
              <ScoreBar label="Kurumsal Yapı" value={score.corpScore} max={5} color="#6366f1" />
              <ScoreBar label="Uyum & Risk" value={score.complianceScore} max={5} color={score.complianceScore >= 4 ? "#10b981" : score.complianceScore >= 2 ? "#94a3b8" : "#f87171"} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={14} className="text-cyan-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#5A7A96]">KKB & Kredi Sicili</span>
              <span className="ml-auto text-[9px] font-bold text-cyan-500">{score?.kkbScore ?? '–'} / 10</span>
            </div>
            <SelectField
              label="KKB Kategorisi"
              value={data.kkbCategory ?? 'iyi'}
              options={[
                { val: 'iyi', label: 'İyi' },
                { val: 'orta', label: 'Orta' },
                { val: 'kotu', label: 'Kötü' },
                { val: 'cok_kotu', label: 'Çok Kötü' },
              ]}
              onChange={v => update('kkbCategory', v)}
            />
            <SelectField
              label="Aktif Gecikme Süresi"
              value={String(data.activeDelayDays ?? 0)}
              options={[
                { val: '0', label: 'Yok' },
                { val: '30', label: '1–30 gün' },
                { val: '90', label: '31–90 gün' },
                { val: '999', label: '90+ gün' },
              ]}
              onChange={v => update('activeDelayDays', Number(v))}
            />
            <div className="rounded-xl p-4 space-y-0" style={{ background: 'rgba(0,0,0,0.03)' }}>
              <SwitchField
                label="Çek Protestosu"
                desc="Aktif protesto kaydı var mı?"
                value={data.checkProtest ?? false}
                onChange={v => update('checkProtest', v)}
              />
              <SwitchField
                label="İcra Dosyası"
                desc="Aktif icra takibi var mı?"
                value={data.enforcementFile ?? false}
                onChange={v => update('enforcementFile', v)}
              />
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#5A7A96]">Banka İlişkileri</span>
              <span className="ml-auto text-[9px] font-bold text-blue-500">{score?.bankScore ?? '–'} / 10</span>
            </div>
            <SliderField
              label="Kredi Limiti Kullanım Oranı"
              value={data.creditLimitUtilPct ?? 50}
              min={0} max={100} step={5} unit="%"
              onChange={v => update('creditLimitUtilPct', v)}
            />
            <SliderField
              label="Ortalama Kredi Vadesi"
              value={data.avgMaturityMonths ?? 12}
              min={1} max={60} step={1} unit=" ay"
              onChange={v => update('avgMaturityMonths', v)}
            />
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.03)' }}>
              <SwitchField
                label="Çoklu Banka İlişkisi"
                desc="2+ banka ile aktif çalışıyor"
                value={data.hasMultipleBanks ?? false}
                onChange={v => update('hasMultipleBanks', v)}
              />
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={14} className="text-indigo-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#5A7A96]">Kurumsal Yapı</span>
              <span className="ml-auto text-[9px] font-bold text-indigo-500">{score?.corpScore ?? '–'} / 5</span>
            </div>
            <SliderField
              label="Şirket Yaşı"
              value={data.companyAgeYears ?? 3}
              min={0} max={30} step={1} unit=" yıl"
              onChange={v => update('companyAgeYears', v)}
            />
            <SelectField
              label="Denetim Düzeyi"
              value={data.auditLevel ?? 'ymm'}
              options={[
                { val: 'yok', label: 'Denetimsiz' },
                { val: 'smmm', label: 'SMMM' },
                { val: 'ymm', label: 'YMM' },
                { val: 'tam_tasdik', label: 'Tam Tasdik' },
                { val: 'bagimsiz', label: 'Bağımsız' },
              ]}
              onChange={v => update('auditLevel', v)}
            />
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.03)' }}>
              <SwitchField
                label="Ortaklık Yapısı Şeffaf"
                desc="Gerçek faydalanıcılar tescilli"
                value={data.ownershipClarity ?? true}
                onChange={v => update('ownershipClarity', v)}
              />
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} className="text-sky-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#5A7A96]">Uyum & Risk</span>
              <span className="ml-auto text-[9px] font-bold text-sky-500">{score?.complianceScore ?? '–'} / 5</span>
            </div>
            <div className="rounded-xl p-4 space-y-0" style={{ background: 'rgba(0,0,0,0.03)' }}>
              <SwitchField
                label="Vergi Borcu"
                desc="Vadesi geçmiş vergi borcu"
                value={data.hasTaxDebt ?? false}
                onChange={v => update('hasTaxDebt', v)}
              />
              <SwitchField
                label="SGK Borcu"
                desc="Vadesi geçmiş SGK borcu"
                value={data.hasSgkDebt ?? false}
                onChange={v => update('hasSgkDebt', v)}
              />
            </div>
            <SliderField
              label="Aktif Dava Sayısı"
              value={data.activeLawsuitCount ?? 0}
              min={0} max={10} step={1} unit=" dava"
              onChange={v => update('activeLawsuitCount', v)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
