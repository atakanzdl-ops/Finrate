'use client'

import './dashboard.css'
import './finrate-v2.css'

/**
 * Dashboard Layout - 1:1 Migration Mode
 * This layout is simplified to allow the premium dashboard (from desktop files)
 * to render its own topbar and app-shell without conflicts.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  )
}
