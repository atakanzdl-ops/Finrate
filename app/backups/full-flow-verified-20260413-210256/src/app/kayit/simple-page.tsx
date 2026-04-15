'use client'

import { useState } from 'react'
import Link from 'next/link'

const PLANS = ['Demo (Ücretsiz)', 'Standart', 'Pro']

export default function KayitSimplePage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    plan: 'Demo (Ücretsiz)',
    kvkk: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const planKey = (label: string): string => {
    if (label.startsWith('Standart')) return 'STANDART'
    if (label.startsWith('Pro')) return 'PRO'
    return 'DEMO'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.kvkk) {
      setError('KVKK onayı zorunludur.')
      return
    }

    setLoading(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          email: form.email.normalize('NFC'),
          password: form.password,
          fullName: form.name.normalize('NFC'),
          companyName: form.company ? form.company.normalize('NFC') : null,
          plan: planKey(form.plan),
        }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(String(data.error ?? 'Kayıt başarısız.').normalize('NFC'))
        return
      }
      window.location.href = '/dashboard'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Sunucu yanıt vermedi (15 sn). Lütfen tekrar deneyin.')
      } else {
        setError('Bağlantı hatası oluştu. Lütfen tekrar deneyin.')
      }
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3C5D] tracking-tight">Finrate</h1>
          <p className="text-sm text-slate-500 mt-2">Kurumsal hesap oluşturun</p>
        </div>

        <section className="bg-white border border-[#E5E9F0] rounded-xl shadow-sm p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Ad Soyad</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  required
                  placeholder="Ahmet Yılmaz"
                  className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Şirket</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => update('company', e.target.value)}
                  required
                  placeholder="ABC A.Ş."
                  className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">E-posta</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                required
                placeholder="ornek@sirket.com"
                className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Şifre</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                required
                minLength={8}
                placeholder="En az 8 karakter"
                className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Plan</label>
              <div className="grid grid-cols-3 gap-2">
                {PLANS.map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => update('plan', plan)}
                    className={`h-10 rounded-lg border text-xs font-semibold transition-colors ${
                      form.plan === plan
                        ? 'bg-[#0B3C5D] text-white border-[#0B3C5D]'
                        : 'bg-white text-[#1E293B] border-[#E5E9F0] hover:border-[#0B3C5D]'
                    }`}
                  >
                    {plan.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.kvkk}
                onChange={(e) => update('kvkk', e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#0B3C5D] focus:ring-[#0B3C5D]"
              />
              KVKK aydınlatma metnini okudum ve kabul ediyorum.
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-[#0B3C5D] text-white text-sm font-semibold hover:bg-[#0A3552] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Hesap oluşturuluyor...' : 'Hesap Oluştur'}
            </button>
          </form>

          <p className="text-sm text-slate-500 text-center mt-5">
            Zaten hesabınız var mı?{' '}
            <Link href="/giris" className="font-semibold text-[#0B3C5D] hover:text-[#0A3552]">
              Giriş Yap
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
