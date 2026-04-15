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
    a: 'Finrate, firmaların mali tablolarını bankacılık standartlarında analiz eden ve kredi notunu hesaplayan bir platformdur.',
  },
  {
    q: 'Hangi dosya formatlarını yükleyebilirim?',
    a: 'Excel (.xlsx, .xls), CSV ve PDF formatındaki mali veri dosyalarını yükleyebilirsiniz.',
  },
  {
    q: 'Kredi notu nasıl hesaplanıyor?',
    a: 'Finrate 100 puan üzerinden çalışır: 70 puan finansal kriterler, 30 puan subjektif kriterlerden gelir.',
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
          <Link href="/giris" className="btn-ghost">
            Daha fazla soru için giriş yapın
          </Link>
        </div>
      </div>
    </section>
  )
}
