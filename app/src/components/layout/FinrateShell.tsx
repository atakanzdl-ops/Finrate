'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FinrateLogoCanvas } from '@/components/ui/FinrateLogoCanvas'
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  GitBranch,
  FileText,
  Settings,
  LogOut,
  ShieldCheck,
} from 'lucide-react'

export default function FinrateShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  // Yönetici bağlantısı yalnızca role=ADMIN kullanıcıya görünür (sunucu tarafı ayrıca 403 döner)
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => setIsAdmin(d?.user?.role === 'ADMIN')).catch(() => {})
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (err) {
      console.error('Logout error:', err)
    }
    // Redirect koşulsuz: sunucu cookie cleanup garantili, /dashboard auth guard'lı
    window.location.href = '/giris'
  }

  function navClass(base: string) {
    const isActive =
      base === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(base)
    return `nav-link sidebar-link${isActive ? ' active' : ''}`
  }

  const navItems = [
    { href: '/dashboard',             label: 'Kontrol Paneli', icon: LayoutDashboard },
    { href: '/dashboard/sirketler',   label: 'Şirketler',      icon: Building2 },
    { href: '/dashboard/analiz',      label: 'Analizler',      icon: BarChart3 },
    { href: '/dashboard/gruplar',     label: 'Gruplar',        icon: GitBranch },
    { href: '/dashboard/raporlar',    label: 'Raporlar',       icon: FileText },
    ...(isAdmin ? [{ href: '/dashboard/admin', label: 'Yönetim', icon: ShieldCheck }] : []),
  ]

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand flex items-center gap-3">
          <FinrateLogoCanvas size={40} />
          <div>
            <div style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '0.5px',
              lineHeight: 1.2,
            }}>
              <span style={{ color: '#0B1F3A' }}>FIN</span>
              <span style={{
                background: 'linear-gradient(90deg, #0284c7, #0DC4A0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>RATE</span>
            </div>
            <div className="brand-subtitle">BANKACI KALİTESİ DEĞERLENDİRME</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={navClass(href)}>
              <Icon size={18} strokeWidth={2.5} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link href="/dashboard/ayarlar" className={navClass('/dashboard/ayarlar')}>
            <Settings size={18} strokeWidth={2.5} />
            <span>Ayarlar</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="nav-link w-full bg-transparent border-0 text-left cursor-pointer"
          >
            <LogOut size={18} strokeWidth={2.5} />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      <div className="dashboard-main bg-brand-bg">
        <main className="max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
