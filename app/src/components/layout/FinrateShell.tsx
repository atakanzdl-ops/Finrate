'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  FileText,
  Settings,
} from 'lucide-react'

export default function FinrateShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  function navClass(base: string) {
    const isActive =
      base === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(base)
    return `nav-link${isActive ? ' active' : ''}`
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/sirketler', label: 'Sirketler', icon: Building2 },
    { href: '/dashboard/analiz', label: 'Analiz', icon: BarChart3 },
    { href: '/dashboard/raporlar', label: 'Raporlar', icon: FileText },
  ]

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand flex items-center gap-3">
          <div className="brand-mark">F</div>
          <div>
            <div className="brand-title">FINRATE</div>
            <div className="brand-subtitle">Bank Grade Rating</div>
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

        <div className="mt-auto">
          <Link href="#" className="nav-link">
            <Settings size={18} strokeWidth={2.5} />
            <span>Ayarlar</span>
          </Link>
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
