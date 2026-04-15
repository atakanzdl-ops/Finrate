const STEPS = [
  {
    number: '01',
    title: 'Verinizi Yükleyin',
    description:
      'Mizan, beyanname veya bilanço verilerinizi Excel, CSV ya da PDF olarak yükleyin. Manuel giriş de mevcut.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Sistem Analiz Eder',
    description:
      '25 finansal oran otomatik hesaplanır. Grup analizi seçildiyse intercompany eliminasyon uygulanır.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.398-1.397 2.2a24.159 24.159 0 01-4.806-.825" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Rating & Skoru Görün',
    description:
      'AAA\'dan D\'ye 10 kademeli rating, 0-100 arası puan ve banker gözüyle yazılmış analiz raporu.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Senaryo Simüle Edin',
    description:
      'Kalem kalem slider\'larla "şu borcu azaltsam ne olur?" sorusunu anında cevaplayın. PDF olarak indirin.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
]

export default function HowItWorks() {
  return (
    <section id="platform" className="relative py-28 overflow-hidden">
      {/* Arka plan glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Başlık */}
        <div className="text-center mb-16">
          <span className="text-cyan-500 text-sm font-semibold tracking-widest uppercase mb-3 block">
            Nasıl Çalışır?
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            4 adımda finansal netlik
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Veri yüklemeden bankaya gönderilecek rapora kadar her şey tek platformda.
          </p>
        </div>

        {/* Adımlar */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative group">
              {/* Connector çizgisi */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[calc(100%_-_12px)] w-6 h-px bg-gradient-to-r from-cyan-500/40 to-transparent z-10" />
              )}

              <div className="glass-card rounded-2xl p-6 h-full hover:border-cyan-500/30 transition-all duration-300 group-hover:translate-y-[-4px]">
                {/* Numara + İkon */}
                <div className="flex items-start justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl btn-gradient flex items-center justify-center text-white flex-shrink-0">
                    {step.icon}
                  </div>
                  <span className="text-white/10 text-3xl font-black tabular-nums">
                    {step.number}
                  </span>
                </div>

                <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
