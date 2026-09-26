'use client'

import Link from 'next/link'
import { useState } from 'react'

type FaqItem = {
  q: string
  a: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Finrate nedir, ne işe yarar?',
    a: 'Finrate, firmaların mali tablolarını bankacılık metodolojisiyle analiz eden ve 100 puan üzerinden bir Finrate Notu (ön değerlendirme notu) üreten bir platformdur. Finrate bir kredi derecelendirme kuruluşu değildir; çıktılar karar destek amaçlıdır.',
  },
  {
    q: 'Hangi dosya formatlarını yükleyebilirim?',
    a: 'Excel (.xlsx, .xls), CSV ve PDF formatındaki mali veri dosyalarını yükleyebilirsiniz.',
  },
  {
    q: 'Finrate Notu nasıl hesaplanıyor?',
    a: 'Finrate 100 puan üzerinden çalışır: 70 puan 25 finansal orandan (likidite, kârlılık, kaldıraç, faaliyet), 30 puan subjektif kriterlerden (KKB, banka ilişkileri, kurumsal yapı, uyum) gelir. Subjektif faktörler girilmeden nihai not ve rapor oluşmaz. Ayrıntılar Metodoloji sayfasındadır.',
  },
  {
    q: 'Ara dönem (geçici vergi) verileriyle analiz yapılabilir mi?',
    a: 'Evet. 3, 6 ve 9 aylık dönemlerde gelir tablosu kalemleri yıllıklandırılır ve rapor "oranlar yıllıklandırılmış" ibaresiyle işaretlenir.',
  },
  {
    q: 'Senaryo analizi ne işe yarar?',
    a: 'Notunuzu artırmak için hangi aksiyonların kaç puan etkisi olacağını sayısal olarak gösterir.',
  },
  {
    q: 'Verilerim güvende mi?',
    a: 'Veriler 256-bit SSL ile korunur; altyapı KVKK uyumludur.',
  },
  {
    q: 'Mali müşavirler Finrate’i nasıl kullanabilir?',
    a: 'Müşteri bazlı çoklu analiz ve rapor üretimi ile portföy yönetimini hızlandırabilir.',
  },
]

export function FaqSection() {
  const [open, setOpen] = useState<number>(0)

  return (
    <section className="section" id="sss">
      <div className="container">
        <div style={{ textAlign: 'center' }}>
          <div className="section-label">SSS</div>
          <div className="section-title outfit" style={{ maxWidth: 'none' }}>
            Sıkça sorulan sorular
          </div>
        </div>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = idx === open
            return (
              <div key={item.q} className={`faq-item ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="faq-q"
                  onClick={() => setOpen(isOpen ? -1 : idx)}
                  aria-expanded={isOpen}
                  style={{ background: 'none', border: 'none', width: '100%', padding: 0, textAlign: 'left' }}
                >
                  {item.q}
                  <svg className="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a">{item.a}</div>
              </div>
            )
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/metodoloji" className="btn-ghost">
            Skorlama metodolojisini inceleyin
          </Link>
        </div>
      </div>
    </section>
  )
}
