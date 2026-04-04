'use client'

import { useState, useEffect } from 'react'
import { User, Lock, CreditCard, Shield, Loader2, Check } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

interface UserProfile {
  id: string
  email: string
  fullName: string
  companyName: string | null
  subscription: {
    plan: string
    status: string
    currentPeriodEnd: string
    billingCycle: string
  } | null
}

const PLAN_LABELS: Record<string, string>   = { DEMO: 'Demo', STANDART: 'Standart', PRO: 'Pro' }
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Aktif', TRIALING: 'Deneme', CANCELLED: 'İptal', PAST_DUE: 'Ödeme Bekliyor' }
const BILLING_LABELS: Record<string, string> = { MONTHLY: 'Aylık', YEARLY: 'Yıllık' }

export default function AyarlarPage() {
  const [user, setUser]           = useState<UserProfile | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [fullName, setFullName]   = useState('')
  const [companyName, setCompany] = useState('')
  const [pwForm, setPwForm]       = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError]     = useState('')
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwSaved, setPwSaved]     = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user)
        setFullName(d.user?.fullName ?? '')
        setCompany(d.user?.companyName ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  async function saveProfile() {
    setSaving(true)
    await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, companyName }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function changePassword() {
    setPwError('')
    if (pwForm.next.length < 8)          { setPwError('Yeni şifre en az 8 karakter olmalı.'); return }
    if (pwForm.next !== pwForm.confirm)  { setPwError('Şifreler eşleşmiyor.'); return }
    setPwSaving(true)
    const res = await fetch('/api/user/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    })
    const d = await res.json()
    setPwSaving(false)
    if (!res.ok) { setPwError(d.error ?? 'Hata oluştu.'); return }
    setPwSaved(true)
    setPwForm({ current: '', next: '', confirm: '' })
    setTimeout(() => setPwSaved(false), 2000)
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>

  return (
    <DashboardShell>
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Ayarlar</h1>

      {/* Profil */}
      <Section icon={<User size={16} />} title="Profil Bilgileri">
        <div className="space-y-3">
          <Field label="Ad Soyad">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </Field>
          <Field label="Şirket Adı">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Opsiyonel"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50"
            />
          </Field>
          <Field label="E-posta">
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full px-3 py-2 bg-white/3 border border-white/5 rounded-lg text-sm text-white/40 cursor-not-allowed"
            />
          </Field>
          <div className="flex justify-end">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
              {saved ? 'Kaydedildi' : 'Kaydet'}
            </button>
          </div>
        </div>
      </Section>

      {/* Şifre */}
      <Section icon={<Lock size={16} />} title="Şifre Değiştir">
        <div className="space-y-3">
          <Field label="Mevcut Şifre">
            <input type="password" value={pwForm.current}
              onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </Field>
          <Field label="Yeni Şifre">
            <input type="password" value={pwForm.next}
              onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
              placeholder="En az 8 karakter"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50"
            />
          </Field>
          <Field label="Yeni Şifre (Tekrar)">
            <input type="password" value={pwForm.confirm}
              onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </Field>
          {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          <div className="flex justify-end">
            <button
              onClick={changePassword}
              disabled={pwSaving || !pwForm.current}
              className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            >
              {pwSaving ? <Loader2 size={14} className="animate-spin" /> : pwSaved ? <Check size={14} /> : null}
              {pwSaved ? 'Değiştirildi' : 'Şifreyi Değiştir'}
            </button>
          </div>
        </div>
      </Section>

      {/* Abonelik */}
      {user?.subscription && (
        <Section icon={<CreditCard size={16} />} title="Abonelik">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-white/50">Plan</span>
              <span className="text-sm font-semibold text-white">
                {PLAN_LABELS[user.subscription.plan] ?? user.subscription.plan}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-white/50">Durum</span>
              <span className="text-sm font-semibold text-cyan-400">
                {STATUS_LABELS[user.subscription.status] ?? user.subscription.status}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-white/50">Faturalama</span>
              <span className="text-sm text-white/70">
                {BILLING_LABELS[user.subscription.billingCycle] ?? user.subscription.billingCycle}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-white/50">Dönem Sonu</span>
              <span className="text-sm text-white/70">
                {new Date(user.subscription.currentPeriodEnd).toLocaleDateString('tr-TR')}
              </span>
            </div>
            {user.subscription.plan !== 'PRO' && (
              <div className="mt-2 pt-3 border-t border-white/5">
                <a href="/fiyatlar" className="text-sm text-cyan-400 hover:underline">
                  Planı yükselt →
                </a>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* KVKK */}
      <Section icon={<Shield size={16} />} title="KVKK & Gizlilik">
        <div className="space-y-2 text-xs text-white/50 leading-relaxed">
          <p>Verileriniz Almanya&apos;da (Hetzner) barındırılan, KVKK uyumlu sunucularda saklanmaktadır.</p>
          <p>Kişisel verileriniz üçüncü taraflarla paylaşılmaz.</p>
          <div className="flex gap-4 pt-2">
            <a href="/kvkk"       className="text-cyan-400 hover:underline">KVKK Aydınlatma Metni</a>
            <a href="/gizlilik"   className="text-cyan-400 hover:underline">Gizlilik Politikası</a>
          </div>
        </div>
      </Section>
    </div>
    </DashboardShell>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <span className="text-cyan-400">{icon}</span>
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/50 mb-1">{label}</label>
      {children}
    </div>
  )
}
