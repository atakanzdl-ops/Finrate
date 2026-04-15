import Link from 'next/link'

const benefits = [
  'Finansal skorunuzu görün',
  'Zayıf noktalarınızı tespit edin',
  'Nasıl yükselteceğinizi öğrenin',
]

const actionRows = [
  ['Cari oran', '1.12x', '1.45x', '+1.4 puan'],
  ['Net kâr marjı', '%2.8', '%5.5', '+1.6 puan'],
  ['Alacak tahsil süresi', '118 gün', '82 gün', '+1.2 puan'],
]

export default function LandingSalesPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FB] text-[#1A1A1A]">
      <header className="border-b border-[#E5E9F0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-sm font-semibold tracking-[0.18em] text-[#0B3C5D]">FINRATE</div>
            <div className="text-xs text-[#6B7280]">Rating Intelligence</div>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#faydalar" className="text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]">Faydalar</a>
            <a href="#aksiyon" className="text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]">Aksiyon</a>
            <a href="#basla" className="text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]">Başla</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/giris" className="rounded-lg border border-[#E5E9F0] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#F7F9FB]">
              Giriş Yap
            </Link>
            <Link href="/kayit" className="rounded-lg bg-[#0B3C5D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0A3451]">
              Ücretsiz Başla
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-[#E5E9F0] bg-[linear-gradient(180deg,#ffffff_0%,#f7f9fb_100%)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-[#D7E4EE] bg-[#EDF4F8] px-3 py-1 text-xs font-semibold text-[#0B3C5D]">
              Bankaların baktığı metriklerle analiz
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-[#1A1A1A] md:text-6xl">
              Finansal gücünüzü
              <span className="block text-[#0B3C5D]">veriye dökün</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#6B7280]">
              Şirketinizin finansal sağlığını ölçün, kredi başvurusu öncesi ne yapmanız gerektiğini öğrenin.
            </p>
            <div className="mt-8">
              <Link href="/kayit" className="rounded-xl bg-[#0B3C5D] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0A3451]">
                Ücretsiz Başla
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E9F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-[#6B7280]">Demo görsel</div>
                <div className="mt-1 text-2xl font-bold text-[#1A1A1A]">Skor 74 / Rating A</div>
              </div>
              <div className="rounded-full bg-[#EDF8F0] px-3 py-1 text-xs font-semibold text-[#16A34A]">+6 puan</div>
            </div>
            <div className="mt-4 text-sm text-[#6B7280]">Dashboard’dan örnek kart görünümü</div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ['Likidite', '71'],
                ['Kârlılık', '68'],
                ['Kaldıraç', '64'],
                ['Faaliyet', '77'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#E5E9F0] bg-[#F7F9FB] p-4">
                  <div className="text-sm font-medium text-[#6B7280]">{label}</div>
                  <div className="mt-2 text-2xl font-bold text-[#1A1A1A]">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#E5E9F0] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-xl border border-[#D7E4EE] bg-[#EDF4F8] px-6 py-5 text-center text-base font-semibold text-[#0B3C5D]">
            Bankaların baktığı metriklerle analiz
          </div>
        </div>
      </section>

      <section id="faydalar" className="mx-auto max-w-7xl px-6 py-16">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold tracking-[0.16em] text-[#0B3C5D]">3 ANA FAYDA</div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
            Ziyaretçinin görmek istediği 3 temel cevap
          </h2>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {benefits.map((item, index) => (
            <article key={item} className="rounded-xl border border-[#E5E9F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.04)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF4F8] text-sm font-semibold text-[#0B3C5D]">
                {index + 1}
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[#1A1A1A]">{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section id="aksiyon" className="border-y border-[#E5E9F0] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-xl">
            <div className="text-sm font-semibold tracking-[0.16em] text-[#0B3C5D]">AKSİYON BLOĞU</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
              1 notch yükselmek için yapılması gerekenler
            </h2>
            <p className="mt-4 text-base leading-8 text-[#6B7280]">
              Sistem sadece analiz yapmaz. Notu aşağı çeken metrikleri ve yukarı taşımak için hangi adımların gerektiğini görünür hale getirir.
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E9F0] bg-[#F7F9FB] p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1A1A1A]">Minimum Set</div>
                <div className="mt-1 text-sm text-[#6B7280]">Yaklaşık +4.2 puan etki</div>
              </div>
              <div className="rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-semibold text-[#D97706]">Hedef: BBB → A</div>
            </div>
            <div className="mt-6 space-y-3">
              {actionRows.map(([title, current, target, score]) => (
                <div key={title} className="rounded-xl border border-[#E5E9F0] bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold text-[#1A1A1A]">{title}</div>
                    <div className="text-sm font-bold text-[#0B3C5D]">{score}</div>
                  </div>
                  <div className="mt-2 text-sm text-[#6B7280]">
                    Mevcut: <span className="font-semibold text-[#1A1A1A]">{current}</span> · Hedef: <span className="font-semibold text-[#1A1A1A]">{target}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="basla" className="mx-auto max-w-7xl px-6 py-16">
        <div className="rounded-2xl border border-[#E5E9F0] bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.04)]">
          <div className="text-sm font-semibold tracking-[0.16em] text-[#0B3C5D]">BAŞLAYIN</div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            Finansal notunuzu bugün görün
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[#6B7280]">
            Mevcut durumu görün, zayıf noktalarınızı tespit edin ve kredi başvurusu öncesi hangi adımları atmanız gerektiğini öğrenin.
          </p>
          <div className="mt-8">
            <Link href="/kayit" className="rounded-xl bg-[#0B3C5D] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0A3451]">
              Ücretsiz Başla
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
