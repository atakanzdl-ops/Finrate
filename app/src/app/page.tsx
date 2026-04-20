import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import { FaqSection } from '@/components/FaqSection'
import { Logo } from '@/components/ui/Logo'

function loadInlineStyle() {
  try {
    const htmlPath = join(process.cwd(), 'src', 'app', 'finrate_landing.html')
    const raw = readFileSync(htmlPath, 'utf-8')
    const m = raw.match(/<style>([\s\S]*?)<\/style>/i)
    return m?.[1] ?? ''
  } catch {
    return ''
  }
}

const pricingItems = [
  {
    plan: 'Bireysel',
    name: 'Başlangıç',
    amount: '₺1.999',
    period: '4 analiz hakkı · KDV dahil',
    features: ['Tüm finansal oranlar (25 metrik)', 'Excel / PDF yükleme', '5 yıllık trend analizi', 'Senaryo analizi modülü', 'Subjektif faktör değerlendirme', 'ÜFE reel büyüme düzeltmesi', 'Kredi notu artırıcı öneriler', 'PDF rapor üretimi'],
    href: '/kayit',
    button: 'Hemen Satın Al',
    featured: false,
  },
  {
    plan: 'Mali Müşavir',
    name: 'S.M.M.M',
    amount: '₺6.999',
    period: '5 ayrı erişim kodu · KDV dahil',
    features: ['Başlangıç paketindeki tüm özellikler', 'Her kodda 4 analiz hakkı', 'Toplam 20 analiz hakkı (5 × 4)', 'Kodları müşterilerinize devredebilirsiniz'],
    href: '/kayit',
    button: 'Hemen Satın Al',
    featured: true,
  },
  {
    plan: 'Finansal Danışman',
    name: 'Profesyonel',
    amount: '₺29.999',
    period: '100 analiz hakkı · KDV dahil',
    features: ['S.M.M.M paketindeki tüm özellikler', '100 müşteri analizi kapasitesi'],
    href: '/kayit',
    button: 'Hemen Satın Al',
    featured: false,
  },
  {
    plan: 'Kurumsal',
    name: 'KOBİ / Ticari',
    amount: 'İletişime Geçin',
    period: 'Sınırsız kullanım · kuruma özel',
    features: ['Profesyonel paketteki tüm özellikler', 'Sınırsız analiz', 'Kredi dosyası hazırlama', 'Kredi danışmanlığı', 'Forecast & nakit akış analizi', 'Kurumsal raporlama', '1 yıllık finansal danışmanlık'],
    href: 'mailto:info@finrate.com.tr',
    button: 'İletişime Geçin',
    featured: false,
  },
]

export default function Page() {
  const styleText = loadInlineStyle()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleText }} />

      <nav>
        <Link href="/" aria-label="Finrate ana sayfa">
          <Logo />
        </Link>
        <ul className="nav-links">
          <li><Link href="#nasil-calisir">Nasıl Çalışır</Link></li>
          <li><Link href="#ozellikler">Özellikler</Link></li>
          <li><Link href="#fiyatlar">Fiyatlar</Link></li>
          <li><Link href="#sss">SSS</Link></li>
        </ul>
        <div className="nav-actions">
          <Link href="/giris" className="btn-ghost">Giriş Yap</Link>
          <Link href="/kayit" className="btn-primary">Ücretsiz Başla</Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <div className="hero-badge"><span className="hero-badge-dot" />Bankacılık Standartlarında Finansal Rating</div>
          <h1 className="outfit">Bankadan Önce<br /><em>Finrate.</em></h1>
          <p className="hero-sub">Türk KOBİ, mali müşavir ve finans müdürleri için bankacılık metodolojisinde finansal rating platformu.</p>
          <div className="hero-btns">
            <Link href="/kayit" className="btn-hero btn-hero-primary">Ücretsiz Analiz Başlat</Link>
            <Link href="#fiyatlar" className="btn-hero btn-hero-secondary">Planları Gör</Link>
          </div>
          <div className="hero-stats">
            <div className="stat-item"><div className="stat-num">25</div><div className="stat-label">Finansal metrik</div></div>
            <div className="stat-item"><div className="stat-num">10</div><div className="stat-label">Rating kademesi</div></div>
            <div className="stat-item"><div className="stat-num">100</div><div className="stat-label">TCMB benchmark puanı</div></div>
          </div>
        </div>
        <div className="hero-card-wrap">
          <div className="score-card">
            <div className="score-card-header">
              <div><div className="score-card-label">Anlık Sonuç</div><div className="score-card-title">Finrate Rating Kartı</div></div>
              <div className="score-badge">Canlı</div>
            </div>
            <div className="score-main">
              <div><div className="score-num">74</div><div className="score-denom">/ 100</div></div>
              <div><div className="score-rating">BBB+</div><div className="score-rating-label">Kredi Notu</div></div>
            </div>
            <div className="score-teminat"><div className="score-teminat-label">Kredi Görünümü</div><div className="score-teminat-text">Kefalet ile çalışma potansiyeli</div></div>
            <div className="score-actions">
              <div className="score-action-row"><span className="score-action-icon" /><span className="score-action-text">Cari oran iyileştirme</span><span className="score-action-pts">+3</span></div>
              <div className="score-action-row"><span className="score-action-icon" /><span className="score-action-text">Borç vadesi yapılandırma</span><span className="score-action-pts">+4</span></div>
              <div className="score-action-row"><span className="score-action-icon" /><span className="score-action-text">Karlılık artışı</span><span className="score-action-pts">+6</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="trust-bar">
        <div className="trust-item"><span className="trust-dot"><span className="trust-dot-inner" /></span>TCMB Sektör Ortalamaları</div>
        <div className="trust-item"><span className="trust-dot"><span className="trust-dot-inner" /></span>KVKK uyumlu</div>
        <div className="trust-item"><span className="trust-dot"><span className="trust-dot-inner" /></span>256-bit SSL</div>
      </div>

      <section className="section" id="nasil-calisir">
        <div className="container">
          <div className="section-label">Nasıl Çalışır</div>
          <div className="section-title outfit">3 adımda finansal rating</div>
          <p className="section-sub">Mali verinizi yükleyin, skorunuzu görün, not artırma planınızı çıkarın.</p>
          <div className="steps">
            <div className="step"><div className="step-num">01</div><h3>Mali Veri Yükleme</h3><p>Excel/PDF dosyalarını yükleyin.</p></div>
            <div className="step"><div className="step-num">02</div><h3>Skor Hesaplama</h3><p>25 metrik ile 100 puan skorlama.</p></div>
            <div className="step"><div className="step-num">03</div><h3>Rating Üretimi</h3><p>AAA’dan D’ye not ve açıklama.</p></div>
            <div className="step"><div className="step-num">04</div><h3>Aksiyon Planı</h3><p>Minimum ve ideal set ile iyileştirme yolu.</p></div>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="ozellikler">
        <div className="container">
          <div className="section-label">Ne Görürsünüz</div>
          <div className="section-title outfit">Karar odaklı analiz bileşenleri</div>
          <p className="section-sub">Findeks sadeliği + bankacı derinliği + senaryo motoru.</p>
          <div className="features-grid">
            <div className="feature-card"><h3>Hibrit Skorlama</h3><p>70 finansal + 30 subjektif yapı.</p></div>
            <div className="feature-card"><h3>Guardrail Sistemi</h3><p>Yapay not şişmesini engelleyen güvenlik katmanı.</p></div>
            <div className="feature-card"><h3>Senaryo Motoru</h3><p>“BB’den BBB’ye nasıl çıkarım?” sorusuna sayısal cevap.</p></div>
            <div className="feature-card"><h3>Bankaya Hazır PDF</h3><p>Yönetici özeti, skor breakdown, aksiyon planı.</p></div>
            <div className="feature-card"><h3>TCMB Benchmark</h3><p>TCMB sektör ortalamaları ile kıyaslama.</p></div>
            <div className="feature-card"><h3>Çoklu Dönem</h3><p>2021-2025 trend takibi ve dönem karşılaştırması.</p></div>
          </div>
        </div>
      </section>

      <section className="scenario-section">
        <div className="container">
          <div className="scenario-grid">
            <div>
              <div className="section-label">Senaryo Motoru</div>
              <div className="section-title outfit" style={{ color: 'white' }}>BB&apos;den BBB&apos;ye nasıl çıkarsınız?</div>
              <p className="section-sub">Her aksiyonun nota etkisini saniyeler içinde görün.</p>
            </div>
            <div className="scenario-demo">
              <div className="scenario-title-small">Örnek Senaryo</div>
              <div className="scenario-bands">
                <div className="band band-current"><div className="band-rating band-rating-current outfit">BB</div><div className="band-info"><div className="band-score">Mevcut: 63/100</div><div className="band-label">Kefalet + ipotek</div></div></div>
                <div className="band band-target1"><div className="band-rating band-rating-t1 outfit">BBB</div><div className="band-info"><div className="band-score">Hedef: 68/100</div><div className="band-action">Sermaye artışı</div></div><div className="band-pts">+5</div></div>
                <div className="band band-target2"><div className="band-rating band-rating-t2 outfit">A</div><div className="band-info"><div className="band-score">Hedef: 76/100</div><div className="band-action">KV→UV + kârlılık</div></div><div className="band-pts">+13</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="fiyatlar">
        <div className="container">
          <div style={{ textAlign: 'center' }}>
            <div className="section-label">Fiyatlar</div>
            <div className="section-title outfit" style={{ maxWidth: 'none', marginBottom: 12 }}>İhtiyacınıza göre plan</div>
          </div>
          <div className="pricing-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', maxWidth: 'none' }}>
            {pricingItems.map((item) => (
              <div key={item.name} className={`price-card${item.featured ? ' featured' : ''}`}>
                {item.featured ? <div className="price-badge">En Popüler</div> : null}
                <div className="price-plan">{item.plan}</div>
                <div className="price-name outfit">{item.name}</div>
                <div className="price-amount outfit" style={item.plan === 'Kurumsal' ? { fontSize: 24, paddingTop: 8 } : undefined}>{item.amount}</div>
                <div className="price-period">{item.period}</div>
                <div className="price-divider" />
                <ul className="price-features">
                  {item.features.map((f) => (
                    <li key={f} className="price-feature"><span className="price-check"><span className="price-check-inner" /></span>{f}</li>
                  ))}
                </ul>
                <Link href={item.href} className={`btn-price ${item.featured ? 'btn-price-teal' : 'btn-price-outline'}`}>{item.button}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqSection />

      <section className="cta-section">
        <div className="container">
          <h2 className="outfit">Bankaya <em>hazırlıklı</em> gidin.</h2>
          <p>Kredi notunuzu önceden öğrenin, zayıf noktaları güçlendirin.</p>
          <div className="cta-btns">
            <Link href="/kayit" className="btn-hero btn-hero-primary">Ücretsiz Analiz Başlat</Link>
            <Link href="mailto:info@finrate.com.tr" className="btn-hero btn-hero-secondary">Bize Yazın</Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="container">
          <div className="footer-grid">
            <div>
              <Logo className="mb-4" />
              <div className="footer-desc">Bankadan önce kredi notunuzu öğrenin. Bankacılık standartlarında finansal rating platformu.</div>
            </div>
            <div className="footer-col">
              <h4>Platform</h4>
              <ul>
                <li><Link href="#nasil-calisir">Nasıl Çalışır</Link></li>
                <li><Link href="#ozellikler">Özellikler</Link></li>
                <li><Link href="#fiyatlar">Fiyatlar</Link></li>
                <li><Link href="/giris">Giriş Yap</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Hukuki</h4>
              <ul>
                <li><Link href="#">Gizlilik Politikası</Link></li>
                <li><Link href="#">Kullanım Koşulları</Link></li>
                <li><Link href="#">KVKK Aydınlatma</Link></li>
                <li><Link href="#">Çerez Politikası</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>İletişim</h4>
              <ul>
                <li><Link href="mailto:info@finrate.com.tr">info@finrate.com</Link></li>
                <li><Link href="#sss">SSS</Link></li>
                <li><Link href="#">Destek</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">© 2026 Finrate. Tüm hakları saklıdır.</div>
            <div className="footer-legal">
              <Link href="#">Gizlilik</Link>
              <Link href="#">Koşullar</Link>
              <Link href="#">KVKK</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
