'use client'

const RATING_SCALE = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']

const BAR_HEIGHTS = [30, 45, 38, 60, 55, 72, 65, 90]

export default function HeroSection() {
  return (
    <section className="relative min-h-screen dot-pattern overflow-hidden">
      {/* Background Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-cyan-500/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-blue-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-8 grid lg:grid-cols-2 gap-16 items-center min-h-screen">

        {/* ── SOL: Metin ── */}
        <div className="flex flex-col gap-7">

          {/* Badge */}
          <div className="inline-flex w-fit items-center gap-2 glass rounded-full px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-xs text-white/60 font-medium tracking-wide">
              Yapay Zeka Destekli Finansal Analiz
            </span>
          </div>

          {/* Başlık */}
          <div className="flex flex-col gap-1">
            <h1 className="text-5xl xl:text-6xl font-black leading-[1.1] tracking-tight text-white">
              Finansal gücünüzü
            </h1>
            <h1 className="text-5xl xl:text-6xl font-black leading-[1.1] tracking-tight text-gradient">
              veriye dökün
            </h1>
          </div>

          {/* Alt yazı */}
          <p className="text-white/55 text-lg leading-relaxed max-w-[440px]">
            25 finansal oran, grup konsolide analiz ve gerçek zamanlı senaryo
            simülasyonuyla kredi gücünüzü anında öğrenin.
            <span className="text-white/80"> Bankaların baktığı gibi bakın.</span>
          </p>

          {/* CTA Butonlar */}
          <div className="flex flex-wrap gap-3">
            <a
              href="/kayit"
              className="btn-gradient text-white font-semibold px-7 py-3.5 rounded-xl text-sm"
            >
              Hemen Başla — Ücretsiz
            </a>
            <a
              href="#platform"
              className="glass border border-white/10 hover:border-cyan-500/40 text-white/80 hover:text-white font-medium px-7 py-3.5 rounded-xl text-sm transition-all"
            >
              Nasıl Çalışır?
            </a>
          </div>

          {/* Rating Skalası */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-white/35 text-xs font-medium mr-1">Tam Skala:</span>
            {RATING_SCALE.map((r, i) => (
              <span
                key={r}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  i === 0
                    ? 'btn-gradient text-white shadow-cyan'
                    : i < 3
                    ? 'text-cyan-400/80 glass'
                    : i < 6
                    ? 'text-white/50 glass'
                    : 'text-white/25 glass'
                }`}
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* ── SAĞ: Dashboard Mockup ── */}
        <div className="hidden lg:flex items-center justify-end">
          <div className="relative w-[460px] h-[420px]">

            {/* Ana Dashboard Kartı */}
            <div className="glass-card rounded-2xl p-5 glow-cyan absolute inset-0 top-10 left-4 right-4">
              {/* Üst satır */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/45 text-xs font-medium tracking-wide uppercase">
                  Kredi Analizi
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-white/40 text-xs">Canlı</span>
                </div>
              </div>

              {/* Rating skalası — küçük */}
              <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
                {RATING_SCALE.map((r, i) => (
                  <div key={r} className={`flex-shrink-0 transition-all ${i === 0 ? '' : 'opacity-25'}`}>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-md block ${
                      i === 0 ? 'btn-gradient text-white' : 'glass text-white'
                    }`}>
                      {r}
                    </span>
                    {i === 0 && (
                      <div className="flex justify-center mt-0.5">
                        <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-0 border-t-[5px] border-l-transparent border-r-transparent border-t-cyan-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Skor + Bar Chart */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/40 text-xs mb-1 uppercase tracking-wide">Finansal Skor</p>
                  <p className="text-[52px] font-black text-gradient leading-none">892</p>
                  <p className="text-cyan-400/70 text-xs mt-1.5 font-medium">↑ 12 puan — son 3 ay</p>
                </div>

                {/* Bar Chart */}
                <div className="flex items-end gap-1.5 h-20">
                  {BAR_HEIGHTS.map((h, i) => (
                    <div
                      key={i}
                      className="w-3.5 rounded-t-sm transition-all"
                      style={{
                        height: `${h}%`,
                        background: i === BAR_HEIGHTS.length - 1
                          ? 'linear-gradient(180deg, #0ECEAD, #0EA5E9)'
                          : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Floating Kart — Sol üst */}
            <div
              className="glass-card rounded-xl p-3.5 absolute -top-2 -left-2 w-[140px] animate-float"
              style={{ animationDelay: '0s' }}
            >
              <p className="text-white/40 text-[11px] mb-1">Cari Oran</p>
              <p className="text-white font-bold text-xl">2.34</p>
              <div className="flex items-center gap-1 mt-1.5">
                <svg className="w-3 h-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                </svg>
                <span className="text-cyan-400 text-[11px] font-semibold">+0.12</span>
              </div>
            </div>

            {/* Floating Kart — Sağ üst */}
            <div
              className="glass-card rounded-xl p-3.5 absolute -top-4 -right-4 w-[148px] animate-float"
              style={{ animationDelay: '1.5s' }}
            >
              <p className="text-white/40 text-[11px] mb-1">Borç/FAVÖK</p>
              <p className="text-white font-bold text-xl">2.1x</p>
              <p className="text-cyan-400 text-[11px] mt-1.5 font-medium">✓ Sağlıklı</p>
            </div>

            {/* Floating Kart — Sağ alt */}
            <div
              className="glass-card rounded-xl p-3.5 absolute -bottom-4 -right-6 w-[160px] animate-float"
              style={{ animationDelay: '3s' }}
            >
              <p className="text-white/40 text-[11px] mb-1.5">FAVÖK Marjı</p>
              <p className="text-white font-bold text-xl">%18.5</p>
              <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: '65%', background: 'linear-gradient(90deg, #0ECEAD, #0EA5E9)' }}
                />
              </div>
            </div>

            {/* Floating Kart — Sol alt */}
            <div
              className="glass-card rounded-xl p-3.5 absolute -bottom-2 left-0 w-[136px] animate-float"
              style={{ animationDelay: '2s' }}
            >
              <p className="text-white/40 text-[11px] mb-1">Net Kâr Marjı</p>
              <p className="text-white font-bold text-xl">%11.2</p>
              <p className="text-white/40 text-[11px] mt-1">ROE: %24.8</p>
            </div>

          </div>
        </div>
      </div>

      {/* ── STAT BAR ── */}
      <div className="relative max-w-7xl mx-auto px-6 pb-16">
        <div className="glass border border-white/8 rounded-2xl px-8 py-6 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
          <div className="flex items-center gap-4 py-4 sm:py-0 sm:px-10 first:pl-0">
            <span className="text-4xl font-black text-gradient">25+</span>
            <div>
              <p className="text-white font-semibold text-sm">Finansal Oran</p>
              <p className="text-white/40 text-xs">4 kategoride tam analiz</p>
            </div>
          </div>
          <div className="flex items-center gap-4 py-4 sm:py-0 sm:px-10">
            <span className="text-4xl font-black text-gradient">10</span>
            <div>
              <p className="text-white font-semibold text-sm">Kademe Rating</p>
              <p className="text-white/40 text-xs">AAA'dan D'ye tam skala</p>
            </div>
          </div>
          <div className="flex items-center gap-4 py-4 sm:py-0 sm:px-10">
            <span className="text-3xl font-black text-white tracking-tight">
              AAA <span className="text-white/30 text-2xl">→</span> <span className="text-gradient">D</span>
            </span>
            <div>
              <p className="text-white font-semibold text-sm">Tam Skala</p>
              <p className="text-white/40 text-xs">Banka standardı analiz</p>
            </div>
          </div>
        </div>
      </div>

    </section>
  )
}
