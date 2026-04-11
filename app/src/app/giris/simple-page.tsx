'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function GirisSimplePage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          email: email.normalize('NFC'),
          password,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(String(data.error ?? 'Giriş başarısız.').normalize('NFC'))
        return
      }

      window.location.href = '/dashboard'
    } catch {
      setError('Bağlantı hatası oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3C5D] tracking-tight">Finrate</h1>
          <p className="text-sm text-slate-500 mt-2">Hesabınıza giriş yapın</p>
        </div>

        <section className="bg-white border border-[#E5E9F0] rounded-xl shadow-sm p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
                required
                className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm text-[#1E293B] placeholder:text-slate-400 outline-none focus:border-[#0B3C5D]"
              />
            </div>

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
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <p className="text-sm text-slate-500 text-center mt-5">
            Hesabınız yok mu?{' '}
            <Link href="/kayit" className="font-semibold text-[#0B3C5D] hover:text-[#0A3552]">
              Ücretsiz kayıt ol
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
