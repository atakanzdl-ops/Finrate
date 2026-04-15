'use client'

import { useState } from 'react'

const PLANS = [
  {
    name: 'Demo',
    badge: null,
    monthly: 0,
    yearly: 0,
    description: 'Platformu ücretsiz keşfedin.',
    features: [
      'Ayda 2 analiz',
      '25 finansal oran görüntüleme',
      'Skor & rating görüntüleme',
      'PDF indirme yok',
      'Grup analizi yok',
      'Senaryo simülasyonu yok',
    ],
    cta: 'Ücretsiz Başla',
    ctaHref: '/kayit',
    highlight: false,
  },
  {
    name: 'Standart',
    badge: 'En Popüler',
    monthly: 990,
    yearly: 9900,
    description: 'Solo analizde tam güç.',
    features: [
      'Sınırsız solo analiz',
      '25 finansal oran + yorum',
      'PDF rapor indirme',
      'Manuel tenzilat modülü',
      'Senaryo simülasyonu',
      'Çok yıllı karşılaştırma',
      'Grup analizi yok',
    ],
    cta: 'Standart\'ı Seç',
    ctaHref: '/kayit?plan=standart',
    highlight: true,
  },
  {
    name: 'Pro',
    badge: null,
    monthly: 2490,
    yearly: 24900,
    description: 'Holding ve grup yapıları için.',
    features: [
      'Standart\'taki her şey',
      'Grup / konsolide analiz',
      'Intercompany eliminasyon',
      'Çoklu şirket yönetimi',
      'Grup senaryo simülasyonu',
      'Öncelikli destek',
    ],
    cta: 'Pro\'yu Seç',
    ctaHref: '/kayit?plan=pro',
    highlight: false,
  },
]

export default function Pricing() {
  const [yearly, setYearly] = useState(false)

  return (
    <section id="fiyatlar" className="relative py-28 overflow-hidden">
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Başlık */}
        <div className="text-center mb-12">
          <span className="text-cyan-500 text-sm font-semibold tracking-widest uppercase mb-3 block">
            Fiyatlar
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            İhtiyacınıza göre seçin
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto mb-8">
            Tüm planlarda kredi kartı gerekmez. Demo ile başlayın, istediğinizde geçin.
          </p>

          {/* Aylık / Yıllık Toggle */}
          <div className="inline-flex items-center gap-3 glass rounded-full px-5 py-2.5">
            <span className={`text-sm font-medium transition-colors ${!yearly ? 'text-white' : 'text-white/40'}`}>
              Aylık
            </span>
            <button
              onClick={() => setYearly(!yearly)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${yearly ? 'btn-gradient' : 'bg-white/10'}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${yearly ? 'left-7' : 'left-1'}`}
              />
            </button>
            <span className={`text-sm font-medium transition-colors ${yearly ? 'text-white' : 'text-white/40'}`}>
              Yıllık
            </span>
            {yearly && (
              <span className="text-[11px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/20 rounded-full px-2.5 py-0.5">
                2 ay ücretsiz
              </span>
            )}
          </div>
        </div>

        {/* Planlar */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 flex flex-col gap-6 transition-all duration-300 ${
                plan.highlight
                  ? 'glass-card border-cyan-500/40 glow-cyan scale-[1.02]'
                  : 'glass-card'
              }`}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="btn-gradient text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-cyan whitespace-nowrap">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan adı & fiyat */}
              <div>
                <p className="text-white/50 text-sm font-medium mb-1">{plan.name}</p>
                <div className="flex items-end gap-1.5 mb-1">
                  {plan.monthly === 0 ? (
                    <span className="text-4xl font-black text-gradient">Ücretsiz</span>
                  ) : (
                    <>
                      <span className="text-4xl font-black text-white">
                        {(yearly ? plan.yearly / 12 : plan.monthly).toLocaleString('tr-TR')}
                      </span>
                      <span className="text-white/40 text-sm mb-1.5">TL/ay</span>
                    </>
                  )}
                </div>
                {plan.monthly > 0 && yearly && (
                  <p className="text-white/30 text-xs">
                    Yıllık {plan.yearly.toLocaleString('tr-TR')} TL · aylık fatura
                  </p>
                )}
                <p className="text-white/40 text-sm mt-2">{plan.description}</p>
              </div>

              {/* CTA */}
              <a
                href={plan.ctaHref}
                className={`w-full text-center font-semibold py-3 rounded-xl text-sm transition-all ${
                  plan.highlight
                    ? 'btn-gradient text-white'
                    : 'glass border border-white/10 hover:border-cyan-500/30 text-white/80 hover:text-white'
                }`}
              >
                {plan.cta}
              </a>

              {/* Özellikler */}
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => {
                  const isNo = f.startsWith('Grup analizi yok') || f.startsWith('PDF indirme yok') || f.startsWith('Senaryo simülasyonu yok')
                  return (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${isNo ? 'bg-white/5' : 'bg-cyan-500/15'}`}>
                        {isNo ? (
                          <svg className="w-2.5 h-2.5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-2.5 h-2.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={`text-sm ${isNo ? 'text-white/25 line-through' : 'text-white/65'}`}>
                        {f}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Alt not */}
        <p className="text-center text-white/30 text-sm mt-10">
          Tüm ödemeler iyzico güvencesiyle işlenir. İptal istediğinizde, bir sonraki dönemden geçerlidir.
        </p>
      </div>
    </section>
  )
}
