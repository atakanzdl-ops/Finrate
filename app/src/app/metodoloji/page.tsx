import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import {
  RATING_BAND_TABLE, WEIGHT_RANGES, SUBJECTIVE_POINTS, FINANCIAL_WEIGHT,
  SHAREHOLDER_LOAN_WARN_RATIO, SHAREHOLDER_LOAN_CAP_RATIO, fmtWeightRange,
} from '@/config/methodology'
import '../finrate-landing.css'

export const metadata = {
  title:       'Skorlama Metodolojisi — Finrate',
  description: 'Finrate Notu nasıl hesaplanır: 70 puan finansal oranlar, 30 puan subjektif faktörler, TCMB sektör kıyaslaması, rating bantları ve koruyucu kurallar.',
}

// Motor tarafından kullanılan oran grupları (görüntüleme amaçlı liste)
const RATIO_GROUPS: Array<{ key: 'liquidity' | 'profitability' | 'leverage' | 'activity'; items: string[] }> = [
  { key: 'liquidity',     items: ['Cari oran', 'Hızlı oran (asit-test)', 'Nakit oranı', 'Net çalışma sermayesi / aktif', 'Nakit dönüşüm çevrimi', 'Çalışma sermayesi / ciro'] },
  { key: 'profitability', items: ['Brüt kâr marjı', 'FAVÖK marjı', 'FVÖK marjı', 'Net kâr marjı', 'Aktif kârlılığı (ROA)', 'Özkaynak kârlılığı (ROE)', 'Yatırım getirisi (ROIC)', 'Ciro büyümesi', 'ÜFE arındırılmış reel büyüme'] },
  { key: 'leverage',      items: ['Borç / özkaynak', 'Borç / aktif', 'Özkaynak oranı', 'Kısa vadeli finansal borç oranı', 'Net borç / FAVÖK', 'Faiz karşılama oranı'] },
  { key: 'activity',      items: ['Aktif devir hızı', 'Alacak tahsil süresi (DSO)', 'Stok devir süresi (DIO)', 'Ticari borç ödeme süresi (DPO)', 'Sabit varlık devir hızı', 'Faaliyet gideri oranı'] },
]

const SUBJECTIVE_GROUPS = [
  { name: 'Kredi sicili (KKB)',   pts: 10, desc: 'KKB kategorisi, gecikme/takip, çek protestosu, icra dosyası' },
  { name: 'Banka ilişkileri',     pts: 10, desc: 'Limit kullanım oranı, çok bankalı çalışma, ortalama vade' },
  { name: 'Kurumsal yapı',        pts: 5,  desc: 'Şirket yaşı, denetim düzeyi (SMMM / YMM / bağımsız denetim), ortaklık yapısı' },
  { name: 'Uyum & risk',          pts: 5,  desc: 'Vergi borcu, SGK borcu, aktif dava' },
]

const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px',
}
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }

export default function MetodolojiPage() {
  const financialPoints = Math.round(FINANCIAL_WEIGHT * 100)
  return (
    <>
      <nav>
        <Link href="/" aria-label="Finrate ana sayfa"><Logo /></Link>
        <ul className="nav-links">
          <li><Link href="/#nasil-calisir">Nasıl Çalışır</Link></li>
          <li><Link href="/#ozellikler">Özellikler</Link></li>
          <li><Link href="/#fiyatlar">Fiyatlar</Link></li>
          <li><Link href="/metodoloji">Metodoloji</Link></li>
          <li><Link href="/#sss">SSS</Link></li>
        </ul>
        <div className="nav-actions">
          <Link href="/giris" className="btn-ghost">Giriş Yap</Link>
          <Link href="/kayit" className="btn-primary">Ücretsiz Başla</Link>
        </div>
      </nav>

      <section className="section" style={{ paddingTop: 72 }}>
        <div className="container">
          <div className="section-label">Metodoloji</div>
          <div className="section-title outfit">Finrate Notu nasıl hesaplanır?</div>
          <p className="section-sub">
            Finrate Notu, {financialPoints} puanlık finansal skor ile {SUBJECTIVE_POINTS} puanlık subjektif skorun toplamından oluşan
            100 puanlık bir ön değerlendirme notudur. Finansal skor, TCMB Sektör Bilançoları İstatistikleri (2024) ile
            sektörel kıyaslama yapılarak hesaplanır. Finrate bir kredi derecelendirme kuruluşu değildir; not, karar destek amaçlıdır.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 40 }}>
            {/* Finansal skor */}
            <div style={cardStyle}>
              <h3 className="outfit" style={{ fontSize: 20, color: 'var(--navy)', marginBottom: 6 }}>1. Finansal Skor ({financialPoints} puan)</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
                Dört kategoride toplam 25+ oran hesaplanır; her oran sektör ortalamasıyla kıyaslanarak puanlanır.
                Kategori ağırlıkları sektöre göre değişir.
              </p>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Kategori</th><th style={thStyle}>Ağırlık</th><th style={thStyle}>Oranlar</th></tr></thead>
                <tbody>
                  {WEIGHT_RANGES.map(r => {
                    const g = RATIO_GROUPS.find(x => x.key === r.key)
                    return (
                      <tr key={r.key}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{r.label}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtWeightRange(r)}</td>
                        <td style={tdStyle}>{g?.items.join(' · ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Subjektif skor */}
            <div style={cardStyle}>
              <h3 className="outfit" style={{ fontSize: 20, color: 'var(--navy)', marginBottom: 6 }}>2. Subjektif Skor ({SUBJECTIVE_POINTS} puan)</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
                Mali tabloda görünmeyen ama bankaların kredi kararında baktığı faktörler kullanıcı beyanıyla girilir.
                Subjektif faktörler girilmeden nihai not ve rapor oluşmaz.
              </p>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Grup</th><th style={thStyle}>Puan</th><th style={thStyle}>Kapsam</th></tr></thead>
                <tbody>
                  {SUBJECTIVE_GROUPS.map(s => (
                    <tr key={s.name}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{s.name}</td>
                      <td style={tdStyle}>{s.pts}</td>
                      <td style={tdStyle}>{s.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
            {/* Rating bantları */}
            <div style={cardStyle}>
              <h3 className="outfit" style={{ fontSize: 20, color: 'var(--navy)', marginBottom: 6 }}>3. Rating Bantları ({RATING_BAND_TABLE.length} kademe)</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
                Toplam puan aşağıdaki bantlara göre Finrate Notuna dönüştürülür. Artı/eksi alt kademe kullanılmaz.
              </p>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Not</th><th style={thStyle}>Puan aralığı</th><th style={thStyle}>Segment</th></tr></thead>
                <tbody>
                  {RATING_BAND_TABLE.map(b => (
                    <tr key={b.rating}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--navy)' }}>{b.rating}</td>
                      <td style={tdStyle}>{b.min}–{b.max}</td>
                      <td style={tdStyle}>{b.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Koruyucu kurallar */}
            <div style={cardStyle}>
              <h3 className="outfit" style={{ fontSize: 20, color: 'var(--navy)', marginBottom: 6 }}>4. Koruyucu Kurallar ve Özel Durumlar</h3>
              <ul style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <li>
                  <strong style={{ color: 'var(--navy)' }}>Ortaklara borçlar (331 + 431)</strong> yabancı kaynaktır, özkaynak sayılmaz.
                  Özkaynağa oranı %{Math.round(SHAREHOLDER_LOAN_WARN_RATIO * 100)}&#39;i aşarsa raporun İzleme Alanı&#39;na uyarı yazılır;
                  %{Math.round(SHAREHOLDER_LOAN_CAP_RATIO * 100)}&#39;yi aşarsa rating tavanı bir kademe düşürülür ve gerekçesi raporda belirtilir.
                </li>
                <li>
                  <strong style={{ color: 'var(--navy)' }}>Ara dönem verileri</strong> (3 / 6 / 9 aylık geçici vergi beyannamesi): gelir tablosu kalemleri
                  yıllıklandırılır, rapor &quot;oranlar yıllıklandırılmış&quot; ibaresiyle işaretlenir.
                </li>
                <li>
                  <strong style={{ color: 'var(--navy)' }}>Finansal borcu olmayan firma:</strong> faiz karşılama ve kısa vadeli borç oranı
                  &quot;uygulanamaz&quot; sayılır; borçsuzluk ceza puanı üretmez.
                </li>
                <li>
                  <strong style={{ color: 'var(--navy)' }}>Net nakit pozisyonu:</strong> nakit finansal borcu aşıyorsa net borç / FAVÖK uygulanmaz.
                </li>
                <li>
                  <strong style={{ color: 'var(--navy)' }}>Veri doğrulaması:</strong> mizan ve beyanname toplamları %5&#39;ten fazla ayrışıyorsa
                  rapora &quot;veri doğrulaması gerekli&quot; notu düşülür. Eksik kalemler raporda açıkça listelenir.
                </li>
                <li>
                  <strong style={{ color: 'var(--navy)' }}>NACE / sektör:</strong> kayıtta girilen NACE kodu ile seçilen sektör uyuşmuyorsa
                  yükleme sırasında uyarı verilir; sektör benchmarkı seçilen sektöre göre uygulanır.
                </li>
              </ul>
            </div>
          </div>

          {/* Veri kaynakları + sınırlar */}
          <div style={{ ...cardStyle, marginTop: 20 }}>
            <h3 className="outfit" style={{ fontSize: 20, color: 'var(--navy)', marginBottom: 12 }}>5. Veri Kaynakları ve Sınırlar</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
              <div><strong style={{ color: 'var(--navy)' }}>Finansal veriler:</strong> kurumlar / geçici vergi beyannamesi (PDF) ve mizan (Excel), Tek Düzen Hesap Planı (TDHP) 3 haneli hesaplar.</div>
              <div><strong style={{ color: 'var(--navy)' }}>Sektör kıyaslaması:</strong> TCMB Sektör Bilançoları İstatistikleri 2024 yayını. Gerçek zamanlı sektör dinamiklerini yansıtmayabilir.</div>
              <div><strong style={{ color: 'var(--navy)' }}>ÜFE:</strong> TÜİK Yurt İçi Üretici Fiyat Endeksi ile reel büyüme düzeltmesi.</div>
              <div><strong style={{ color: 'var(--navy)' }}>Subjektif veriler:</strong> kullanıcı / mali müşavir beyanı; bağımsız doğrulama yapılmaz. Gerçek KKB entegrasyonu yoktur.</div>
              <div><strong style={{ color: 'var(--navy)' }}>Sorumluluk:</strong> skor, sunulan verilerin doğruluğunu esas alır. Finrate Notu resmi kredi notu, yatırım tavsiyesi veya kredi taahhüdü değildir. Bkz. <Link href="/yasal#sorumluluk" style={{ textDecoration: 'underline' }}>Sorumluluk Reddi</Link>.</div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Link href="/kayit" className="btn-hero btn-hero-primary">Ücretsiz Analiz Başlat</Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="container">
          <div className="footer-bottom" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="footer-copy">© 2026 Finrate. Tüm hakları saklıdır.</div>
            <div className="footer-legal">
              <Link href="/yasal#sorumluluk">Sorumluluk</Link>
              <Link href="/yasal#kvkk">KVKK</Link>
              <Link href="/yasal#gizlilik">Gizlilik</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
