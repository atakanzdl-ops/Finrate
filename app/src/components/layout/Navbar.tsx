'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-1 text-xl font-bold tracking-tight">
          <span className="text-gradient">Fin</span>
          <span className="text-white">rate</span>
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: 'Platform', href: '#platform' },
            { label: 'Çözümler', href: '#cozumler' },
            { label: 'Fiyatlar', href: '#fiyatlar' },
            { label: 'Hakkımızda', href: '#hakkimizda' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-white/70 hover:text-white text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/giris"
            className="text-sm font-medium text-white/80 hover:text-white transition-colors px-4 py-2"
          >
            Giriş Yap
          </Link>
          <Link
            href="/kayit"
            className="btn-gradient text-white text-sm font-semibold px-5 py-2 rounded-lg"
          >
            Ücretsiz Başla
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden glass-strong border-t border-white/5 px-6 py-4 flex flex-col gap-4">
          {['Platform', 'Çözümler', 'Fiyatlar', 'Hakkımızda'].map((item) => (
            <a key={item} href="#" className="text-white/80 hover:text-white text-sm font-medium">
              {item}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <Link href="/giris" className="text-center text-sm text-white/70 py-2">Giriş Yap</Link>
            <Link href="/kayit" className="btn-gradient text-center text-white text-sm font-semibold py-2 rounded-lg">
              Ücretsiz Başla
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
