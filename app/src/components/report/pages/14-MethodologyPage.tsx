'use client'
import type { ReportData } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo'>
}

export default function MethodologyPage({ data }: Props) {
  const { companyName, reportNo } = data

  return (
    <div className="pdf-page">
      <div className="wm">METODOLOJİ</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 13</div><div className="ph-title">Metodoloji &amp; Açıklamalar</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div><div className="ph-pg">Sayfa 14</div></div>
      </div>
      <div className="pc">

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>

          {/* Sol */}
          <div>
            <div className="st" style={{ marginBottom: '12px' }}>Derecelendirme Metodolojisi</div>

            <div style={{ fontSize: '9px', color: '#334155', lineHeight: 1.7, marginBottom: '14px' }}>
              Finrate derecelendirme sistemi, TCMB Sektör Bilançoları İstatistikleri (2024 yayını) ve bankacılık sektörü standartlarına dayalı 75 puanlık finansal skor ile 30 puanlık subjektif skoru birleştiren iki bileşenli bir modeldir.
            </div>

            {/* Kategori tablosu */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '11px', overflow: 'hidden', marginBottom: '14px' }}>
              <table className="stb">
                <thead>
                  <tr><th>Kategori</th><th>Ağırlık</th><th>Oran Sayısı</th></tr>
                </thead>
                <tbody>
                  <tr><td>Likidite</td><td>%25–35</td><td>6 oran</td></tr>
                  <tr><td>Kârlılık</td><td>%20–35</td><td>9 oran</td></tr>
                  <tr><td>Kaldıraç</td><td>%25–40</td><td>6 oran</td></tr>
                  <tr><td>Faaliyet</td><td>%15–20</td><td>6 oran</td></tr>
                  <tr><td>Subjektif</td><td>Sabit 30p</td><td>13 faktör</td></tr>
                </tbody>
              </table>
            </div>

            <div className="st" style={{ marginBottom: '10px' }}>Rating Bandı</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '11px', overflow: 'hidden' }}>
              <table className="stb">
                <thead><tr><th>Rating</th><th>Puan Aralığı</th><th>Segment</th></tr></thead>
                <tbody>
                  {[
                    ['AAA', '92–100', 'Premium'],
                    ['AA',  '84–91',  'Mükemmel'],
                    ['A',   '76–83',  'Çok İyi'],
                    ['BBB', '68–75',  'Yatırım Yapılabilir'],
                    ['BB',  '60–67',  'Yatırım Yapılabilir Alt'],
                    ['B',   '52–59',  'Spekülatif'],
                    ['CCC', '44–51',  'Spekülatif Alt'],
                    ['CC',  '36–43',  'Yüksek Risk'],
                    ['C',   '28–35',  'Çok Yüksek Risk'],
                    ['D',   '0–27',   'Temerrüt Riski'],
                  ].map(([r, p, s]) => (
                    <tr key={r}><td style={{ fontWeight: 700 }}>{r}</td><td>{p}</td><td>{s}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sağ */}
          <div>
            <div className="st" style={{ marginBottom: '12px' }}>Veri Kaynakları</div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '11px', padding: '14px 16px', marginBottom: '14px' }}>
              {[
                ['Finansal Veriler', 'Şirket beyanname verileri (TDHP formatı), yüklenen mali tablolar'],
                ['Sektör Benchmarkları', 'TCMB Sektör Bilançoları İstatistikleri 2024 — ~180.000 firma ortalaması'],
                ['ÜFE Verisi', 'TÜİK Yurt İçi Üretici Fiyat Endeksi — reel büyüme hesabı'],
                ['Subjektif Veriler', 'Sistem kullanıcısı / mali müşavir tarafından girilmiş faktörler'],
                ['KKB Simülasyonu', 'Kullanıcı beyanı; gerçek KKB verisi entegrasyonu mevcut değildir'],
              ].map(([k, v], i) => (
                <div key={i} style={{ paddingBottom: i < 4 ? '8px' : 0, marginBottom: i < 4 ? '8px' : 0, borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0a192f' }}>{k}</div>
                  <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="st" style={{ marginBottom: '12px' }}>Sınırlamalar &amp; Uyarılar</div>
            <div className="rsk">
              <div className="rsk-i">Bu rapor yatırım tavsiyesi niteliği taşımaz; bilgilendirme amacıyla hazırlanmıştır.</div>
              <div className="rsk-i">Derecelendirme, sunulan verilerin doğruluğunu esas alır. Hatalı veya eksik veri sistemin sorumluluğunu ortadan kaldırır.</div>
              <div className="rsk-i">Sektör benchmarkları TCMB 2024 yılı verilerine dayanmaktadır. Gerçek zamanlı sektör dinamiklerini yansıtmayabilir.</div>
              <div className="rsk-i">Subjektif faktörler kullanıcı beyanına dayalıdır; bağımsız doğrulama yapılmamıştır.</div>
            </div>

            <div className="ev" style={{ marginTop: '12px' }}>
              <div className="ev-t">Finrate Hakkında</div>
              <div className="ev-tx">Finrate, KOBİ&apos;ler ve mali müşavirler için bankacılık kalitesinde finansal analiz ve kredi derecelendirme platformudur. TCMB verileri, 25 finansal oran ve sektörel ağırlık profilleriyle birleşik derecelendirme sunmaktadır. <strong style={{ color: '#2dd4bf' }}>finrate.com.tr</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com · {reportNo}</span>
      </div>
    </div>
  )
}
