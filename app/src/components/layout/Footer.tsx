import Link from 'next/link'
import { FinrateLogoCanvas } from '@/components/ui/FinrateLogoCanvas'

const LINKS = {
  Ürün: ['Platform', 'Özellikler', 'Fiyatlar', 'Güncellemeler'],
  Şirket: ['Hakkımızda', 'Blog', 'Kariyer', 'İletişim'],
  Hukuki: ['Gizlilik Politikası', 'Kullanım Koşulları', 'KVKK Aydınlatma', 'Çerez Politikası'],
}

export default function Footer() {
  return (
    <footer className="border-t border-white/5 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">

          {/* Logo & Açıklama */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <FinrateLogoCanvas size={36} />
              <span style={{
                fontFamily: "'Sora', sans-serif",
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: '0.5px',
              }}>
                <span style={{ color: '#ffffff' }}>FIN</span>
                <span style={{
                  background: 'linear-gradient(90deg, #0284c7, #0DC4A0)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>RATE</span>
              </span>
            </Link>
            <p className="text-white/40 text-sm leading-relaxed max-w-[200px]">
              Banka standardında finansal analiz ve kredi skorlama platformu.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a href="#" className="w-8 h-8 glass rounded-lg flex items-center justify-center text-white/40 hover:text-cyan-400 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
              <a href="#" className="w-8 h-8 glass rounded-lg flex items-center justify-center text-white/40 hover:text-cyan-400 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Link kolonları */}
          {Object.entries(LINKS).map(([category, items]) => (
            <div key={category}>
              <p className="text-white text-sm font-semibold mb-4">{category}</p>
              <ul className="flex flex-col gap-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-white/40 hover:text-white/80 text-sm transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Alt çizgi */}
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/25 text-sm">
            © 2026 Finrate. Tüm hakları saklıdır.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500/60 animate-pulse" />
            <span className="text-white/25 text-xs">Tüm sistemler çalışıyor</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
