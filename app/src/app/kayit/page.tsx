'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const PLANS = ['Demo (Ücretsiz)', 'Standart', 'Pro']

export default function KayitPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    plan: 'Demo (Ücretsiz)',
    kvkk: false,
  })
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const planKey = (label: string): string => {
    if (label.startsWith('Standart')) return 'STANDART'
    if (label.startsWith('Pro')) return 'PRO'
    return 'DEMO'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 1) { setStep(2); return }
    setError('')
    if (!form.kvkk) { setError('KVKK metnini onaylamanız gerekiyor.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:       form.email,
          password:    form.password,
          fullName:    form.name,
          companyName: form.company || null,
          plan:        planKey(form.plan),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Kayıt başarısız.'); return }
      window.location.href = '/dashboard'
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 dot-pattern flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/6 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-1 text-2xl font-black">
            <span className="text-gradient">Fin</span>
            <span className="text-white">rate</span>
          </Link>
          <p className="text-white/40 text-sm mt-2">Ücretsiz hesap oluşturun</p>
        </div>

        {/* Adım göstergesi */}
        <div className="flex items-center gap-3 mb-6 px-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-3 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                step >= s ? 'btn-gradient text-white' : 'glass text-white/30'
              }`}>
                {step > s ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                ) : s}
              </div>
              <span className={`text-xs font-medium flex-1 ${step >= s ? 'text-white/70' : 'text-white/25'}`}>
                {s === 1 ? 'Hesap Bilgileri' : 'Şirket & Plan'}
              </span>
              {s < 2 && <div className={`h-px flex-1 transition-all ${step > s ? 'bg-cyan-500/50' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* Kart */}
        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {step === 1 ? (
              <>
                {/* Ad Soyad */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/60 text-sm font-medium">Ad Soyad</label>
                  <input
                    type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
                    placeholder="Ahmet Yılmaz" required
                    className="glass border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm outline-none transition-all bg-transparent"
                  />
                </div>

                {/* E-posta */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/60 text-sm font-medium">E-posta</label>
                  <input
                    type="email" value={form.email} onChange={(e) => update('email', e.target.value)}
                    placeholder="ornek@sirket.com" required
                    className="glass border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm outline-none transition-all bg-transparent"
                  />
                </div>

                {/* Şifre */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/60 text-sm font-medium">Şifre</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'} value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      placeholder="En az 8 karakter" required minLength={8}
                      className="w-full glass border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-3 pr-11 text-white placeholder-white/20 text-sm outline-none transition-all bg-transparent"
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-gradient text-white font-semibold py-3.5 rounded-xl text-sm mt-1">
                  Devam Et →
                </button>
              </>
            ) : (
              <>
                {/* Şirket adı */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/60 text-sm font-medium">Şirket Adı</label>
                  <input
                    type="text" value={form.company} onChange={(e) => update('company', e.target.value)}
                    placeholder="ABC A.Ş." required
                    className="glass border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm outline-none transition-all bg-transparent"
                  />
                </div>

                {/* Plan seçimi */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/60 text-sm font-medium">Plan Seçin</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLANS.map((p) => (
                      <button
                        key={p} type="button"
                        onClick={() => update('plan', p)}
                        className={`py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                          form.plan === p
                            ? 'btn-gradient text-white border-transparent'
                            : 'glass text-white/50 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {p.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                  {form.plan !== 'Demo (Ücretsiz)' && (
                    <p className="text-white/30 text-xs mt-1">
                      Kayıt sonrası ödeme sayfasına yönlendirileceksiniz.
                    </p>
                  )}
                </div>

                {/* KVKK */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <div
                    onClick={() => update('kvkk', !form.kvkk)}
                    className={`w-5 h-5 rounded-md flex-shrink-0 mt-0.5 flex items-center justify-center border transition-all ${
                      form.kvkk ? 'btn-gradient border-transparent' : 'border-white/20 glass'
                    }`}
                  >
                    {form.kvkk && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-white/40 text-xs leading-relaxed">
                    <a href="#" className="text-white/60 hover:text-white/80">KVKK Aydinlatma Metni</a>&apos;ni okudum,
                    kişisel verilerimin işlenmesine onay veriyorum.
                  </span>
                </label>

                {/* Hata */}
                {error && (
                  <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                    {error}
                  </div>
                )}

                {/* Butonlar */}
                <div className="flex gap-3 mt-1">
                  <button
                    type="button" onClick={() => setStep(1)}
                    className="flex-1 glass border border-white/10 text-white/60 font-medium py-3.5 rounded-xl text-sm hover:text-white transition-all"
                  >
                    ← Geri
                  </button>
                  <button
                    type="submit" disabled={loading}
                    className="flex-[2] btn-gradient text-white font-semibold py-3.5 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Hesap oluşturuluyor...
                      </>
                    ) : 'Hesabı Oluştur'}
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/25 text-xs">zaten hesabınız var mı?</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <p className="text-center">
            <Link href="/giris" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors">
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

