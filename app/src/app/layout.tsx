import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finrate — Finansal Gücünüzü Veriye Dökün',
  description: 'Gelişmiş kredi skorlama ve finansal analiz platformu. 25 finansal oran, grup konsolide analiz ve senaryo simülasyonu.',
  keywords: 'kredi skoru, finansal analiz, kredi rating, konsolide analiz, finans',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
