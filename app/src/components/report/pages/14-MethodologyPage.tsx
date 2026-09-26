'use client'
import type { ReportData } from '@/types/report'
import { RATING_BAND_TABLE, WEIGHT_RANGES, SUBJECTIVE_POINTS, SHAREHOLDER_LOAN_WARN_RATIO, SHAREHOLDER_LOAN_CAP_RATIO, fmtWeightRange } from '@/config/methodology'

const RATIO_COUNT: Record<string, number> = { liquidity: 6, profitability: 9, leverage: 6, activity: 6 }

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo'>
  sector?: string
}

export default function MethodologyPage({ data, sector }: Props) {
  const { companyName, reportNo } = data

  return (
    <div className="pdf-page">
      <div className="wm">METODOLOJİ</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 13</div><div className="ph-title">Metodoloji &amp; Açıklamalar</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 15</div></div>
      </div>
      <div className="pc">

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>

          {/* Sol */}
          <div>
            <div className="st" style={{ marginBottom: '12px' }}>Derecelendirme Metodolojisi</div>

            <div style={{ fontSize: '9px', color: '#334155', lineHeight: 1.7, marginBottom: '14px' }}>
              Finrate derecelendirme sistemi, TCMB Sektör Bilançoları İstatistikleri (2024 yayını) ve bankacılık sektörü standartlarına dayalı 70 puanlık finansal skor ile 30 puanlık subjektif skoru birleştiren iki bileşenli bir modeldir.
            </div>

            {/* Kategori tablosu */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '11px', overflow: 'hidden', marginBottom: '14px' }}>
              <table className="stb">
                <thead>
                  <tr><th>Kategori</th><th>Ağırlık</th><th>Oran Sayısı</th></tr>
                </thead>
                <tbody>
                  {WEIGHT_RANGES.map(r => (
                    <tr key={r.key}><td>{r.label}</td><td>{fmtWeightRange(r)}</td><td>{RATIO_COUNT[r.key]} oran</td></tr>
                  ))}
                  <tr><td>Subjektif</td><td>Sabit {SUBJECTIVE_POINTS}p</td><td>13 faktör</td></tr>
                </tbody>
              </table>
            </div>

            <div className="st" style={{ marginBottom: '10px' }}>Rating Bandı</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '11px', overflow: 'hidden' }}>
              <table className="stb">
                <thead><tr><th>Rating</th><th>Puan Aralığı</th><th>Segment</th></tr></thead>
                <tbody>
                  {RATING_BAND_TABLE.map(b => [b.rating, `${b.min}–${b.max}`, b.label]).map(([r, p, s]) => (
                    <tr key={r}><td style={{ fontWeight: 700 }}>{r}</td><td>{p}</td><td>{s}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="st" style={{ marginTop: '14px', marginBottom: '8px' }}>Koruyucu Kurallar (Guardrail)</div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '11px', padding: '10px 12px', fontSize: '8px', color: '#78350f', lineHeight: 1.5 }}>
              Ortaklara borçlar (331 + 431) yabancı kaynaktır, özkaynak sayılmaz. Özkaynağa oranı %{Math.round(SHAREHOLDER_LOAN_WARN_RATIO * 100)}&#39;i aşarsa İzleme Alanı&#39;na uyarı yazılır;
              %{Math.round(SHAREHOLDER_LOAN_CAP_RATIO * 100)}&#39;yi aşarsa rating tavanı bir kademe düşürülür ve gerekçesi raporda belirtilir.
              Ara dönem (3/6/9 aylık) verilerinde akış kalemleri yıllıklandırılır. Finansal borcu olmayan firmada faiz karşılama oranı &quot;uygulanamaz&quot; sayılır ve ceza puanı üretmez.
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

            <div className="st" style={{ marginBottom: '12px' }}>Yasal Uyarı &amp; Sınırlar</div>
            <div className="rsk">
              <div className="rsk-i">Bu rapor yatırım tavsiyesi niteliği taşımaz; bilgilendirme amacıyla hazırlanmıştır.</div>
              <div className="rsk-i">Derecelendirme, sunulan verilerin doğruluğunu esas alır. Hatalı veya eksik veri sistemin sorumluluğunu ortadan kaldırır.</div>
              <div className="rsk-i">Sektör benchmarkları TCMB 2024 yılı verilerine dayanmaktadır. Gerçek zamanlı sektör dinamiklerini yansıtmayabilir.</div>
              <div className="rsk-i">Subjektif faktörler kullanıcı beyanına dayalıdır; bağımsız doğrulama yapılmamıştır.</div>
            </div>

            <div className="ev" style={{ marginTop: '12px' }}>
              <div className="ev-t">Finrate Hakkında</div>
              <div className="ev-tx">Finrate; KOBİ&apos;ler, mali müşavirler, sektör profesyonelleri ve kurumsal firmalar için bankacılık düzeyinde finansal analiz ve skorlama platformudur. TCMB verileri, 25+ finansal oran ve sektörel ağırlık profilleriyle birleşik derecelendirme sunmaktadır. <strong style={{ color: '#2dd4bf' }}>www.finrate.com.tr</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
