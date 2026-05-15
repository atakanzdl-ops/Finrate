'use client'

import React from 'react'
import { FinrateLogoCanvas } from './FinrateLogoCanvas'

interface LogoProps {
  className?: string
  showSubtext?: boolean
  size?: number
  /** 'dark' (varsayılan): açık arka plan için koyu metin · 'light': koyu arka plan için beyaz metin */
  variant?: 'dark' | 'light'
}

export const Logo: React.FC<LogoProps> = ({ className = '', showSubtext = true, size = 44, variant = 'dark' }) => {
  const isLight = variant === 'light'

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <FinrateLogoCanvas size={size} />

      <div className="flex flex-col leading-none">
        <div style={{
          fontFamily: "'Sora', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: '0.5px',
          lineHeight: 1,
        }}>
          <span style={{ color: isLight ? '#ffffff' : '#0B1F3A' }}>FIN</span>
          <span style={{
            background: 'linear-gradient(90deg, #0284c7, #0DC4A0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>RATE</span>
        </div>
        {showSubtext && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: isLight ? 'rgba(255,255,255,0.55)' : '#64748B',
            letterSpacing: '0.15em',
            marginTop: 4,
          }}>
            BANKADAN ÖNCE FINRATE
          </span>
        )}
      </div>
    </div>
  )
}
