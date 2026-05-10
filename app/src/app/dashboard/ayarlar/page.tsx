'use client'

import { useState, useEffect, useRef } from 'react'
import {
  User, Lock, CreditCard, Shield, AlertTriangle,
  Loader2, Check, X,
} from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface UserProfile {
  id:          string
  email:       string
  fullName:    string
  companyName: string | null
  subscription: {
    plan:              string
    status:            string
    currentPeriodEnd:  string
    billingCycle:      string
    cancelAtPeriodEnd: boolean
  } | null
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const CODE_LENGTH = 6

const PLAN_LABELS: Record<string, string> = {
  DEMO:     'Demo (Ücretsiz)',
  STANDART: 'Standart',
  PRO:      'Pro',
}
const STATUS_LABELS: Record<string, string> = {
  ACTIVE:   'Aktif',
  TRIALING: 'Deneme Süreci',
  CANCELLED:'İptal Edildi',
  PAST_DUE: 'Ödeme Bekliyor',
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function AyarlarPage() {
  // Sayfa verisi
  const [user, setUser]           = useState<UserProfile | null>(null)
  const [pageLoading, setPageLoading] = useState(true)

  // Profil formu
  const [fullName, setFullName]       = useState('')
  const [companyName, setCompanyName] = useState('')
  const [profileSaving, setProfileSaving]   = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError]     = useState('')

  // Şifre formu
  const [pwForm, setPwForm]   = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwError, setPwError]     = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // Abonelik iptal
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError]     = useState('')

  // Hesap sil modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep]           = useState<'confirm' | 'code'>('confirm')
  const [deleteDigits, setDeleteDigits]       = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [deleteError, setDeleteError]         = useState('')
  const deleteInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Sayfa yükle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/giris'
          return null
        }
        return r.json()
      })
      .then(d => {
        if (d?.user) {
          setUser(d.user)
          setFullName(d.user.fullName ?? '')
          setCompanyName(d.user.companyName ?? '')
        }
      })
      .finally(() => setPageLoading(false))
  }, [])

  // ── Profil kaydet ───────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!fullName.trim()) { setProfileError('Ad Soyad boş olamaz.'); return }
    setProfileError('')
    setProfileSaving(true)
    try {
      const res = await fetch('/api/user/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fullName: fullName.trim(), companyName: companyName.trim() || null }),
      })
      const d = await res.json()
      if (!res.ok) { setProfileError(d.error ?? 'Hata oluştu.'); return }
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Şifre değiştir ──────────────────────────────────────────────────────────
  async function changePassword() {
    setPwError('')
    if (!pwForm.current)               { setPwError('Mevcut şifrenizi girin.'); return }
    if (pwForm.next.length < 8)        { setPwError('Yeni şifre en az 8 karakter olmalı.'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('Yeni şifreler eşleşmiyor.'); return }
    setPwSaving(true)
    try {
      const res = await fetch('/api/user/password', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      })
      const d = await res.json()
      if (!res.ok) { setPwError(d.error ?? 'Hata oluştu.'); return }
      setPwSuccess(true)
      setPwForm({ current: '', next: '', confirm: '' })
      // Şifre değişti → tüm oturumlar geçersiz → /giris'e yönlendir
      setTimeout(() => { window.location.href = '/giris' }, 2500)
    } finally {
      setPwSaving(false)
    }
  }

  // ── Abonelik iptal / geri al ────────────────────────────────────────────────
  async function toggleSubscriptionCancel() {
    setCancelError('')
    setCancelLoading(true)
    const action = user?.subscription?.cancelAtPeriodEnd ? 'resume' : 'cancel'
    try {
      const res = await fetch('/api/subscription/cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) { setCancelError(d.error ?? 'Hata oluştu.'); return }
      setUser(prev => prev && prev.subscription ? {
        ...prev,
        subscription: { ...prev.subscription, cancelAtPeriodEnd: action === 'cancel' },
      } : prev)
    } finally {
      setCancelLoading(false)
    }
  }

  // ── Hesap sil modal ─────────────────────────────────────────────────────────
  function openDeleteModal() {
    setDeleteStep('confirm')
    setDeleteDigits(Array(CODE_LENGTH).fill(''))
    setDeleteError('')
    setShowDeleteModal(true)
  }

  function closeDeleteModal() {
    setShowDeleteModal(false)
    setDeleteError('')
    setDeleteDigits(Array(CODE_LENGTH).fill(''))
    setDeleteStep('confirm')
  }

  async function requestDeletionCode() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete-request', { method: 'POST' })
      const d   = await res.json()
      if (!res.ok) { setDeleteError(d.error ?? 'Hata oluştu.'); return }
      setDeleteStep('code')
      setTimeout(() => deleteInputRefs.current[0]?.focus(), 100)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function confirmDeletion(code: string) {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete-confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }),
      })
      const d = await res.json()
      if (!res.ok) {
        setDeleteError(d.error ?? 'Kod doğrulama başarısız.')
        setDeleteDigits(Array(CODE_LENGTH).fill(''))
        deleteInputRefs.current[0]?.focus()
        return
      }
      window.location.href = d.redirect ?? '/'
    } finally {
      setDeleteLoading(false)
    }
  }

  // OTP input handlers
  const handleDeleteDigitChange = (idx: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...deleteDigits]
    next[idx]  = char
    setDeleteDigits(next)
    setDeleteError('')
    if (char && idx < CODE_LENGTH - 1) deleteInputRefs.current[idx + 1]?.focus()
    if (next.every(d => d !== '') && next.join('').length === CODE_LENGTH) {
      confirmDeletion(next.join(''))
    }
  }

  const handleDeleteKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (deleteDigits[idx]) {
        const next = [...deleteDigits]; next[idx] = ''; setDeleteDigits(next)
      } else if (idx > 0) {
        deleteInputRefs.current[idx - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft'  && idx > 0)             deleteInputRefs.current[idx - 1]?.focus()
    if (e.key === 'ArrowRight' && idx < CODE_LENGTH -1) deleteInputRefs.current[idx + 1]?.focus()
  }

  const handleDeletePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return
    const next = Array(CODE_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDeleteDigits(next)
    deleteInputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus()
    if (pasted.length === CODE_LENGTH) confirmDeletion(pasted)
  }

  // ── Yükleniyor ──────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-[#0B3C5D]" />
        </div>
      </DashboardShell>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardShell>
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 space-y-6">

        {/* Başlık */}
        <div>
          <h1 className="text-2xl font-bold text-[#0B3C5D]">Ayarlar</h1>
          <p className="text-sm text-[#5A7A96] mt-1">
            Hesap bilgilerinizi ve tercihlerinizi yönetin.
          </p>
        </div>

        {/* ─── 1. Profil ─────────────────────────────────────────────────────── */}
        <SettingsCard title="Profil Bilgileri" icon={<User size={16} />}>
          <div className="space-y-4">
            <Field label="Ad Soyad">
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] outline-none focus:border-[#0B3C5D] bg-white"
              />
            </Field>
            <Field label="Şirket Adı (opsiyonel)">
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="ABC A.Ş."
                className="w-full h-10 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D] bg-white"
              />
            </Field>
            <Field label="E-posta">
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                className="w-full h-10 rounded-lg border border-[#E5E9F0] px-3 text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
              />
              <p className="text-xs text-[#5A7A96] mt-1">E-posta adresi değiştirilemez.</p>
            </Field>
            {profileError   && <InlineAlert type="error">{profileError}</InlineAlert>}
            {profileSuccess && <InlineAlert type="success">Profil güncellendi.</InlineAlert>}
            <div className="flex justify-end pt-1">
              <button
                onClick={saveProfile}
                disabled={profileSaving}
                className="h-9 px-5 rounded-lg bg-[#0B3C5D] text-white text-sm font-semibold hover:bg-[#0A3552] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {profileSaving
                  ? <Loader2 size={14} className="animate-spin" />
                  : profileSuccess
                    ? <Check size={14} />
                    : null}
                {profileSuccess ? 'Kaydedildi' : 'Kaydet'}
              </button>
            </div>
          </div>
        </SettingsCard>

        {/* ─── 2. Şifre ──────────────────────────────────────────────────────── */}
        <SettingsCard title="Şifre Değiştir" icon={<Lock size={16} />}>
          {pwSuccess ? (
            <InlineAlert type="success">
              Şifreniz değiştirildi. Tüm oturumlarınız sonlandırıldı — giriş sayfasına yönlendiriliyorsunuz...
            </InlineAlert>
          ) : (
            <div className="space-y-4">
              <Field label="Mevcut Şifre">
                <input
                  type="password"
                  value={pwForm.current}
                  onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] outline-none focus:border-[#0B3C5D] bg-white"
                />
              </Field>
              <Field label="Yeni Şifre">
                <input
                  type="password"
                  value={pwForm.next}
                  onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                  placeholder="En az 8 karakter"
                  className="w-full h-10 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D] bg-white"
                />
              </Field>
              <Field label="Yeni Şifre (Tekrar)">
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] outline-none focus:border-[#0B3C5D] bg-white"
                />
              </Field>
              {pwError && <InlineAlert type="error">{pwError}</InlineAlert>}
              <div className="flex justify-end pt-1">
                <button
                  onClick={changePassword}
                  disabled={pwSaving || !pwForm.current}
                  className="h-9 px-5 rounded-lg bg-[#0B3C5D] text-white text-sm font-semibold hover:bg-[#0A3552] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {pwSaving && <Loader2 size={14} className="animate-spin" />}
                  Şifreyi Değiştir
                </button>
              </div>
            </div>
          )}
        </SettingsCard>

        {/* ─── 3. Abonelik ───────────────────────────────────────────────────── */}
        {user?.subscription && (
          <SettingsCard title="Abonelik" icon={<CreditCard size={16} />}>
            <div className="space-y-1">
              <InfoRow
                label="Plan"
                value={PLAN_LABELS[user.subscription.plan] ?? user.subscription.plan}
              />
              <InfoRow
                label="Durum"
                value={STATUS_LABELS[user.subscription.status] ?? user.subscription.status}
              />
              <InfoRow
                label="Faturalama"
                value={user.subscription.billingCycle === 'MONTHLY' ? 'Aylık' : 'Yıllık'}
              />
              <InfoRow
                label="Dönem Sonu"
                value={new Date(user.subscription.currentPeriodEnd).toLocaleDateString('tr-TR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              />
            </div>

            {user.subscription.cancelAtPeriodEnd && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Aboneliğiniz{' '}
                <strong>
                  {new Date(user.subscription.currentPeriodEnd).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </strong>{' '}
                tarihinde sona erecek ve yenilenmeyecek.
              </div>
            )}

            {cancelError && <InlineAlert type="error">{cancelError}</InlineAlert>}

            {user.subscription.status !== 'CANCELLED' && (
              <div className="mt-4 pt-4 border-t border-[#E5E9F0]">
                <button
                  onClick={toggleSubscriptionCancel}
                  disabled={cancelLoading}
                  className={`text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                    user.subscription.cancelAtPeriodEnd
                      ? 'text-[#0B3C5D] hover:text-[#0A3552]'
                      : 'text-red-600 hover:text-red-700'
                  }`}
                >
                  {cancelLoading && <Loader2 size={12} className="animate-spin" />}
                  {user.subscription.cancelAtPeriodEnd ? 'İptali Geri Al' : 'Dönem Sonunda İptal Et'}
                </button>
              </div>
            )}
          </SettingsCard>
        )}

        {/* ─── 4. Yasal & Gizlilik ───────────────────────────────────────────── */}
        <SettingsCard title="Yasal & Gizlilik" icon={<Shield size={16} />}>
          <p className="text-sm text-[#5A7A96] mb-3">
            Verileriniz AB merkezli sunucularda (AWS Frankfurt) saklanmaktadır.
            Kişisel verileriniz üçüncü taraflarla paylaşılmaz. KVKK uyumluluk
            detayları için yakında yayınlanacak Aydınlatma Metni&apos;ne bakınız.
          </p>
          <div className="flex gap-6">
            <span className="text-sm text-slate-400 cursor-not-allowed">
              KVKK Aydınlatma Metni
              <span className="ml-1 text-xs">(yakında)</span>
            </span>
            <span className="text-sm text-slate-400 cursor-not-allowed">
              Gizlilik Politikası
              <span className="ml-1 text-xs">(yakında)</span>
            </span>
          </div>
        </SettingsCard>

        {/* ─── 5. Tehlikeli Bölge ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-red-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-3 bg-red-50 border-b border-red-100">
            <AlertTriangle size={16} className="text-red-600" />
            <p className="text-sm font-semibold text-red-700">Tehlikeli Bölge</p>
          </div>
          <div className="p-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#1E293B]">Hesabı Kalıcı Olarak Kapat</p>
              <p className="text-sm text-[#5A7A96] mt-1">
                Hesabınız kapatılır ve tekrar giriş yapamazsınız. KVKK gereği
                verileriniz silinmez, yalnızca erişim sona erer.
              </p>
            </div>
            <button
              onClick={openDeleteModal}
              className="shrink-0 h-9 px-4 rounded-lg bg-[#EF4444] text-white text-sm font-semibold hover:bg-[#DC2626] transition-colors"
            >
              Hesabı Sil
            </button>
          </div>
        </div>

      </div>

      {/* ─── Hesap Sil Modal ───────────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(11,60,93,0.45)' }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Modal başlık */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E9F0]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-600" />
                <h2 className="text-base font-bold text-[#1E293B]">Hesabı Sil</h2>
              </div>
              <button
                onClick={closeDeleteModal}
                className="text-slate-400 hover:text-[#1E293B] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5">

              {/* Step 1 — Onay */}
              {deleteStep === 'confirm' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 leading-relaxed">
                    <p className="font-semibold mb-1">Bu işlem geri alınamaz.</p>
                    <p>
                      Hesabınız kapatılır ve tekrar giriş yapamazsınız. KVKK gereği
                      verileriniz saklanır, yalnızca erişim sona erer.
                    </p>
                  </div>
                  <p className="text-sm text-[#1E293B]">
                    Devam etmek için{' '}
                    <strong>{user?.email}</strong>{' '}
                    adresine 6 haneli bir onay kodu göndereceğiz.
                  </p>
                  {deleteError && <InlineAlert type="error">{deleteError}</InlineAlert>}
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      onClick={closeDeleteModal}
                      className="h-9 px-4 rounded-lg border border-[#E5E9F0] text-sm font-medium text-[#1E293B] hover:bg-slate-50 transition-colors"
                    >
                      Vazgeç
                    </button>
                    <button
                      onClick={requestDeletionCode}
                      disabled={deleteLoading}
                      className="h-9 px-4 rounded-lg bg-[#EF4444] text-white text-sm font-semibold hover:bg-[#DC2626] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                      Kod Gönder
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2 — OTP kodu */}
              {deleteStep === 'code' && (
                <div className="space-y-4">
                  <p className="text-sm text-[#1E293B]">
                    <strong>{user?.email}</strong> adresine gönderilen 6 haneli kodu girin.
                    Hesabınızı silmek için kodu doğrulayın.
                  </p>
                  <div
                    className="flex gap-2 justify-center"
                    onPaste={handleDeletePaste}
                  >
                    {deleteDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={el => { deleteInputRefs.current[i] = el }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={e => handleDeleteDigitChange(i, e.target.value)}
                        onKeyDown={e => handleDeleteKeyDown(i, e)}
                        disabled={deleteLoading}
                        autoFocus={i === 0}
                        className={[
                          'w-11 h-12 text-center text-lg font-bold rounded-lg border-2 outline-none transition-colors bg-white',
                          'text-[#1E293B]',
                          d ? 'border-[#EF4444]' : 'border-[#E5E9F0]',
                          'focus:border-[#EF4444]',
                          deleteLoading ? 'opacity-50 cursor-not-allowed' : '',
                        ].join(' ')}
                      />
                    ))}
                  </div>
                  {deleteError && <InlineAlert type="error">{deleteError}</InlineAlert>}
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      onClick={closeDeleteModal}
                      className="h-9 px-4 rounded-lg border border-[#E5E9F0] text-sm font-medium text-[#1E293B] hover:bg-slate-50 transition-colors"
                    >
                      Vazgeç
                    </button>
                    <button
                      onClick={() => {
                        const code = deleteDigits.join('')
                        if (code.length === CODE_LENGTH) confirmDeletion(code)
                      }}
                      disabled={deleteLoading || deleteDigits.some(d => !d)}
                      className="h-9 px-4 rounded-lg bg-[#EF4444] text-white text-sm font-semibold hover:bg-[#DC2626] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                      Hesabı Sil
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

// ─── Yardımcı Bileşenler ──────────────────────────────────────────────────────

function SettingsCard({
  title, icon, children,
}: {
  title:    string
  icon:     React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[#E5E9F0] bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#E5E9F0]">
        <span className="text-[#0B3C5D]">{icon}</span>
        <p className="text-sm font-semibold text-[#0B3C5D]">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#E5E9F0] last:border-0">
      <span className="text-sm text-[#5A7A96]">{label}</span>
      <span className="text-sm font-medium text-[#1E293B]">{value}</span>
    </div>
  )
}

function InlineAlert({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  const cls = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>
  )
}
