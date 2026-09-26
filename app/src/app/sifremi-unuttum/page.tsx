'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const RESEND_WAIT = 60

export default function SifremiUnuttumPage() {
  const [step, setStep]         = useState<'email' | 'reset' | 'done'>('email')
  const [email, setEmail]       = useState('')
  const [code, setCode]         = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (cooldown > 0) return
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ email: email.normalize('NFC') }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) { setCooldown(data.retryAfter ?? RESEND_WAIT); setStep('reset'); return }
        setError(String(data.error ?? 'Kod gönderilemedi.'))
        return
      }
      setCooldown(RESEND_WAIT)
      setStep('reset')
    } catch {
      setError('Bağlantı hatası oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalıdır.'); return }
    if (password !== password2) { setError('Şifreler birbiriyle aynı değil.'); return }
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ email: email.normalize('NFC'), code: code.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(String(data.error ?? 'Şifre sıfırlanamadı.')); return }
      setStep('done')
    } catch {
      setError('Bağlantı hatası oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]'
  const btnCls   = 'w-full h-11 rounded-lg bg-[#0B3C5D] text-white text-sm font-semibold hover:bg-[#0A3552] disabled:opacity-60 disabled:cursor-not-allowed transition-colors'

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3C5D] tracking-tight">Finrate</h1>
          <p className="text-sm text-slate-500 mt-2">Şifre sıfırlama</p>
        </div>

        <section className="bg-white border border-[#E5E9F0] rounded-xl shadow-sm p-6 sm:p-8">
          {step === 'email' && (
            <form onSubmit={requestCode} className="space-y-4">
              <p className="text-sm text-slate-600">
                Kayıtlı e-posta adresinizi girin; size 6 haneli bir sıfırlama kodu gönderelim.
              </p>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">E-posta</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="ornek@sirket.com" className={inputCls} />
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <button type="submit" disabled={loading} className={btnCls}>
                {loading ? 'Gönderiliyor...' : 'Kod Gönder'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={resetPassword} className="space-y-4">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-[#1E293B]">{email}</span> adresi kayıtlıysa 6 haneli kod gönderildi. Kod 10 dakika geçerlidir.
              </p>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Kod</label>
                <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required placeholder="6 haneli kod" className={inputCls + ' tracking-[0.3em] font-semibold'} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Yeni şifre</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="En az 8 karakter" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Yeni şifre (tekrar)</label>
                <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} required minLength={8} placeholder="••••••••" className={inputCls} />
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <button type="submit" disabled={loading || code.length < 6} className={btnCls}>
                {loading ? 'Kaydediliyor...' : 'Şifreyi Sıfırla'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => requestCode()} disabled={cooldown > 0 || loading}
                  className="text-sm font-semibold text-[#0B3C5D] hover:text-[#0A3552] disabled:opacity-40 disabled:cursor-not-allowed">
                  {cooldown > 0 ? `Kodu yeniden gönder (${cooldown}s)` : 'Kodu yeniden gönder'}
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#EFF9F8] flex items-center justify-center mx-auto">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <h2 className="text-lg font-bold text-[#0B3C5D]">Şifreniz güncellendi</h2>
              <p className="text-sm text-slate-600">Yeni şifrenizle giriş yapabilirsiniz.</p>
              <Link href="/giris" className={btnCls + ' inline-flex items-center justify-center'}>Giriş Yap</Link>
            </div>
          )}
        </section>

        <p className="text-sm text-slate-500 text-center mt-5">
          <Link href="/giris" className="font-semibold text-[#0B3C5D] hover:text-[#0A3552]">Giriş sayfasına dön</Link>
        </p>
      </div>
    </main>
  )
}
