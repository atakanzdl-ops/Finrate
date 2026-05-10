'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

const CODE_LENGTH  = 6
const RESEND_WAIT  = 60  // saniye
const EXPIRE_SECS  = 10 * 60 // 10 dakika

function DogrulamaContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const email        = searchParams.get('email') ?? ''

  const [digits, setDigits]         = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [timeLeft, setTimeLeft]     = useState(EXPIRE_SECS)
  const [resendLoading, setResendLoading]   = useState(false)
  const [resendSuccess, setResendSuccess]   = useState(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // 10 dakika geri sayım
  useEffect(() => {
    if (timeLeft <= 0) return
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000)
    return () => clearInterval(id)
  }, [timeLeft])

  // Yeniden gönder cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Otomatik submit
  const submitCode = useCallback(async (code: string) => {
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/verify-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Doğrulama başarısız.')
        setDigits(Array(CODE_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
        return
      }
      router.push(data.redirect ?? '/dashboard')
    } catch {
      setError('Bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }, [email, router])

  const handleDigitChange = (idx: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx]  = char

    setDigits(next)
    setError('')

    if (char && idx < CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus()
    }

    // Tüm haneler doluysa otomatik gönder
    if (next.every(d => d !== '') && next.join('').length === CODE_LENGTH) {
      submitCode(next.join(''))
    }
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]
        next[idx]  = ''
        setDigits(next)
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft' && idx > 0) inputRefs.current[idx - 1]?.focus()
    if (e.key === 'ArrowRight' && idx < CODE_LENGTH - 1) inputRefs.current[idx + 1]?.focus()
  }

  // Yapıştırma desteği
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return
    const next = Array(CODE_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus()
    if (pasted.length === CODE_LENGTH) submitCode(pasted)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < CODE_LENGTH) { setError('Lütfen 6 haneli kodu eksiksiz girin.'); return }
    submitCode(code)
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading) return
    setResendLoading(true)
    setResendSuccess(false)
    setError('')
    try {
      const res  = await fetch('/api/auth/resend-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setResendCooldown(data.retryAfter ?? RESEND_WAIT)
        } else {
          setError(data.error ?? 'Kod gönderilemedi.')
        }
        return
      }
      setResendSuccess(true)
      setResendCooldown(RESEND_WAIT)
      setTimeLeft(EXPIRE_SECS)
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch {
      setError('Bağlantı hatası oluştu.')
    } finally {
      setResendLoading(false)
    }
  }

  const isExpired = timeLeft <= 0

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px]">

        {/* Logo */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3C5D] tracking-tight">Finrate</h1>
          <p className="text-sm text-slate-500 mt-2">E-posta doğrulama</p>
        </div>

        <section className="bg-white border border-[#E5E9F0] rounded-xl shadow-sm p-6 sm:p-8">

          {/* Başlık */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#EFF9F8] flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#0B3C5D]">Doğrulama Kodu</h2>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-medium text-[#1E293B]">{email}</span> adresine 6 haneli kod gönderdik.
            </p>
          </div>

          {/* Süre gösterimi */}
          {!isExpired && (
            <div className="flex items-center justify-center gap-1.5 mb-5">
              <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${timeLeft < 60 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                Kodun geçerlilik süresi: {formatTime(timeLeft)}
              </div>
            </div>
          )}
          {isExpired && (
            <div className="text-center mb-5">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">
                Kodun süresi doldu — yeni kod isteyin
              </span>
            </div>
          )}

          {/* 6 hane input */}
          <form onSubmit={handleManualSubmit} className="space-y-5">
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  disabled={loading || isExpired}
                  autoFocus={i === 0}
                  className={[
                    'w-11 h-12 text-center text-lg font-bold rounded-lg border-2 outline-none transition-colors',
                    'text-[#0B3C5D] bg-white',
                    d ? 'border-[#2EC4B6]' : 'border-[#E5E9F0]',
                    'focus:border-[#0B3C5D]',
                    (loading || isExpired) ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                />
              ))}
            </div>

            {/* Hata */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-center">
                {error}
              </div>
            )}

            {/* Başarı (resend) */}
            {resendSuccess && !error && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 text-center">
                Yeni kod gönderildi. Lütfen e-postanızı kontrol edin.
              </div>
            )}

            {/* Doğrula butonu */}
            <button
              type="submit"
              disabled={loading || isExpired || digits.some(d => !d)}
              className="w-full h-11 rounded-lg bg-[#0B3C5D] text-white text-sm font-semibold hover:bg-[#0A3552] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Doğrulanıyor...' : 'Doğrula'}
            </button>
          </form>

          {/* Yeniden Gönder */}
          <div className="mt-5 text-center">
            <p className="text-sm text-slate-500 mb-2">Kod gelmedi mi?</p>
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0 || resendLoading}
              className="text-sm font-semibold text-[#0B3C5D] hover:text-[#0A3552] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {resendLoading
                ? 'Gönderiliyor...'
                : resendCooldown > 0
                  ? `Yeniden gönder (${resendCooldown}s)`
                  : 'Yeniden Gönder'}
            </button>
          </div>

        </section>

        <p className="text-xs text-slate-400 text-center mt-4">
          Farklı hesap mı?{' '}
          <a href="/kayit" className="text-[#0B3C5D] font-medium hover:underline">Yeni kayıt ol</a>
          {' '}·{' '}
          <a href="/giris" className="text-[#0B3C5D] font-medium hover:underline">Giriş yap</a>
        </p>
      </div>
    </main>
  )
}

export default function DogrulamaPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <p className="text-slate-400 text-sm">Yükleniyor...</p>
      </main>
    }>
      <DogrulamaContent />
    </Suspense>
  )
}
