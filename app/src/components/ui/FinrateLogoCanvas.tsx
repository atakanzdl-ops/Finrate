'use client'

import { useRef, useEffect } from 'react'

interface FinrateLogoCanvasProps {
  size?: number
}

export function FinrateLogoCanvas({ size = 44 }: FinrateLogoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width  = size * dpr
    canvas.height = size * dpr
    canvas.style.width  = size + 'px'
    canvas.style.height = size + 'px'
    ctx.scale(dpr, dpr)

    const cx   = size / 2
    const cy   = size / 2
    const r    = size * 0.386   // arc radius
    const sw   = size * 0.091   // stroke width
    const boxR = size * 0.205   // corner radius

    // ── Rounded-rect background ────────────────────────────
    ctx.beginPath()
    ctx.moveTo(boxR, 0)
    ctx.lineTo(size - boxR, 0)
    ctx.arcTo(size, 0,    size, boxR,        boxR)
    ctx.lineTo(size, size - boxR)
    ctx.arcTo(size, size, size - boxR, size, boxR)
    ctx.lineTo(boxR, size)
    ctx.arcTo(0, size,    0, size - boxR,    boxR)
    ctx.lineTo(0, boxR)
    ctx.arcTo(0, 0,       boxR, 0,           boxR)
    ctx.closePath()
    ctx.fillStyle = '#0d1f38'
    ctx.fill()

    ctx.save()
    ctx.clip()

    // ── Faint background circle ────────────────────────────
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth   = sw
    ctx.stroke()

    // ── Gradient arc (gap at bottom-left ~225°) ────────────
    const gapCenter  = 225 * Math.PI / 180
    const gapHalf    = 35  * Math.PI / 180
    const arcStart   = gapCenter + gapHalf
    const arcEnd     = gapCenter - gapHalf

    const grad = ctx.createLinearGradient(
      cx + r * Math.cos(arcStart), cy + r * Math.sin(arcStart),
      cx + r * Math.cos(arcEnd),   cy + r * Math.sin(arcEnd),
    )
    grad.addColorStop(0, '#0284c7')
    grad.addColorStop(1, '#0DC4A0')

    ctx.beginPath()
    ctx.arc(cx, cy, r, arcStart, arcEnd, false)
    ctx.strokeStyle = grad
    ctx.lineWidth   = sw
    ctx.lineCap     = 'butt'
    ctx.stroke()

    // ── Dot at arc end ─────────────────────────────────────
    const dotX = cx + r * Math.cos(arcEnd)
    const dotY = cy + r * Math.sin(arcEnd)
    ctx.beginPath()
    ctx.arc(dotX, dotY, size * 0.057, 0, Math.PI * 2)
    ctx.fillStyle = '#0DC4A0'
    ctx.fill()

    ctx.restore()

    // ── "F" letter ─────────────────────────────────────────
    ctx.font          = `700 ${Math.round(size * 0.409)}px Sora, sans-serif`
    ctx.fillStyle     = '#ffffff'
    ctx.textAlign     = 'center'
    ctx.textBaseline  = 'middle'
    ctx.fillText('F', cx, cy + size * 0.023)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, flexShrink: 0, display: 'block' }}
    />
  )
}
