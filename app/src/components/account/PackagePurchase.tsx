'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Mail } from 'lucide-react'

/**
 * Paket satın alma kutusu (Ayarlar → Abonelik).
 * - /api/payments/config: kart ile ödeme açık mı + paketler (fiyat KDV dahil)
 * - Açıksa "Kartla Satın Al" → /api/payments/checkout → iyzico ödeme sayfası
 * - Kapalıysa e-posta ile satın alma bağlantısı
 * - ?odeme=basarili|basarisiz|hata sonucu üstte bant olarak gösterilir
 */

interface PackageInfo { key: string; label: string; credits: number; plan: string; priceTRY: number }

const fmtTRY = (n: number) => '₺' + n.toLocaleString('tr-TR')

const RESULT_TEXT: Record<string, { ok: boolean; text: string }> = {
  basarili:  { ok: true,  text: 'Ödemeniz alındı, analiz haklarınız hesabınıza yüklendi.' },
  basarisiz: { ok: false, text: 'Ödeme tamamlanamadı. Kartınızdan çekim yapılmadı; dilerseniz tekrar deneyin.' },
  hata:      { ok: false, text: 'Ödeme doğrulanırken bir sorun oluştu. Çekim yapıldıysa info@finrate.com.tr adresine yazın, hakkınız elle yüklenir.' },
}

export default function PackagePurchase({ onPurchased }: { onPurchased?: () => void }) {
  const [enabled, setEnabled]   = useState<boolean | null>(null)
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [busy, setBusy]         = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/payments/config')
      .then(r => r.json())
      .then(d => { setEnabled(!!d.enabled); setPackages(Array.isArray(d.packages) ? d.packages : []) })
      .catch(() => setEnabled(false))

    try {
      const state = new URLSearchParams(window.location.search).get('odeme')
      if (state && RESULT_TEXT[state]) {
        setResult(RESULT_TEXT[state])
        if (state === 'basarili') onPurchased?.()
        // Adres çubuğundan parametreyi temizle (yenilemede bant tekrar çıkmasın)
        const url = new URL(window.location.href); url.searchParams.delete('odeme')
        window.history.replaceState({}, '', url.toString())
      }
    } catch { /* SSR / eski tarayıcı */ }
  }, [onPurchased])

  async function buy(key: string) {
    setBusy(key); setError('')
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: key }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.message ?? d.error ?? 'Ödeme başlatılamadı. Lütfen tekrar deneyin.')
        return
      }
      if (d.paymentPageUrl) { window.location.href = d.paymentPageUrl; return }
      if (d.checkoutFormContent) { mountCheckoutForm(String(d.checkoutFormContent)); return }
      setError('Ödeme sayfası alınamadı. Lütfen tekrar deneyin.')
    } catch {
      setError('Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#E5E9F0]">
      <p className="text-sm font-semibold text-[#1E293B]">Paket Satın Al</p>
      <p className="text-xs text-[#5A7A96] mt-0.5">Her paket 12 ay geçerlidir. Her yeni firma-dönem 1 analiz hakkı kullanır. Fiyatlar KDV dahildir.</p>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${result.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {result.text}
        </div>
      )}
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {packages.map(p => (
          <div key={p.key} className="rounded-lg border border-[#E5E9F0] bg-white p-3 flex flex-col">
            <p className="text-sm font-bold text-[#0B3C5D]">{p.label}</p>
            <p className="text-xs text-[#5A7A96]">{p.credits} analiz hakkı</p>
            <p className="text-lg font-black text-[#1E293B] mt-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{fmtTRY(p.priceTRY)}</p>
            {enabled ? (
              <button
                type="button"
                onClick={() => buy(p.key)}
                disabled={busy !== null}
                className="mt-3 h-9 rounded-lg bg-[#0B3C5D] text-white text-xs font-semibold hover:bg-[#0A3552] disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {busy === p.key ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
                Kartla Satın Al
              </button>
            ) : (
              <a
                href={`mailto:info@finrate.com.tr?subject=${encodeURIComponent(p.label + ' paketi satın alma')}`}
                className="mt-3 h-9 rounded-lg border border-[#0B3C5D] text-[#0B3C5D] text-xs font-semibold hover:bg-[#EDF4F8] flex items-center justify-center gap-1.5"
              >
                <Mail size={13} />
                E-posta ile Satın Al
              </a>
            )}
          </div>
        ))}
      </div>

      {enabled === false && (
        <p className="mt-2 text-[11px] text-[#94A3B8]">Kart ile ödeme yakında. Şimdilik havale/EFT için e-posta ile iletişime geçin; hakkınız aynı gün tanımlanır.</p>
      )}
      {enabled && (
        <p className="mt-2 text-[11px] text-[#94A3B8]">Ödemeler iyzico güvencesiyle alınır; kart bilgileriniz Finrate sunucularına ulaşmaz.</p>
      )}
      <div id="iyzipay-checkout-form" className="responsive mt-3" />
    </div>
  )
}

/** iyzico checkoutFormContent (HTML+script) — innerHTML script çalıştırmaz, elle eklenir. */
function mountCheckoutForm(html: string) {
  const host = document.getElementById('iyzipay-checkout-form')
  if (!host) return
  host.innerHTML = ''
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  tpl.content.querySelectorAll('script').forEach(s => {
    const script = document.createElement('script')
    if (s.src) script.src = s.src
    script.text = s.text
    s.replaceWith(script)
  })
  host.appendChild(tpl.content)
  host.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
