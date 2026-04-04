'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  function navClass(base: string) {
    const isActive =
      base === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(base)
    return `nav-link${isActive ? ' active' : ''}`
  }

  return (
    <div className="app-shell">
      {/* Mesh Gradient Background */}
      <div className="mesh-aura">
        <div className="aura-blob aura-1" />
        <div className="aura-blob aura-2" />
        <div className="aura-blob aura-3" />
      </div>
      <div className="dot-grid" />

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-icon"><span>F</span></div>
            <span className="brand-name">Finrate</span>
          </div>

          <nav className="topnav">
            <Link href="/dashboard"          className={navClass('/dashboard')}>Dashboard</Link>
            <Link href="/dashboard/sirketler" className={navClass('/dashboard/sirketler')}>Şirketler</Link>
            <Link href="#"                   className="nav-link">Raporlar</Link>
            <Link href="/dashboard/analiz"   className={navClass('/dashboard/analiz')}>Analiz</Link>
            <Link href="#"                   className="nav-link">Ayarlar</Link>
          </nav>

          <div className="topbar-actions">
            <button className="btn-icon" aria-label="Ara">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button className="btn-icon" aria-label="Bildirimler">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="notif-dot" />
            </button>
            <div className="user-avatar"><span>AÖ</span></div>
          </div>
        </div>
      </header>

      {/* İçerik */}
      <main className="dashboard">
        {children}
      </main>
    </div>
  )
}
