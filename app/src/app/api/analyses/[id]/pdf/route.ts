import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { getUserIdFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const runtime = 'nodejs'
// Vercel serverless fonksiyon timeout (saniye) — PDF render ~20-40s sürer
export const maxDuration = 60

type ReportType = 'standard8' | 'executive15'

function resolveReportType(rawType: string | null, plan: string | null): ReportType {
  return plan === 'PRO' ? 'executive15' : 'standard8'
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  // ─── Sahiplik kontrolü — kullanıcı başkasının analizini indiremez ──────────
  const owned = await prisma.analysis.findFirst({ where: { id, userId }, select: { id: true } })
  if (!owned) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  const requestedType = req.nextUrl.searchParams.get('type')
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true },
  })
  const type = resolveReportType(requestedType, subscription?.plan ?? null)

  try {
    // ─── Chromium / puppeteer-core: Vercel-uyumlu ────────────────────────────
    // Prod / Vercel: @sparticuz/chromium lambda binary + chromium.args kullanılır
    // Lokal:  PUPPETEER_EXECUTABLE_PATH env değişkeni ile yerel Chrome gösterilir
    const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

    const browser = await puppeteer.launch({
      args: isProd ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: isProd
        ? await chromium.executablePath()
        : process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: 'shell',
    })

    const page = await browser.newPage()

    // req.nextUrl.origin → preview/prod URL ayrımı otomatik (NEXT_PUBLIC_APP_URL gerekmez)
    const targetUrl = new URL(
      `/dashboard/analiz/rapor?id=${id}&type=${type}&print=1`,
      req.nextUrl.origin,
    )

    // TÜM cookie'leri taşı (url bazlı — domain hesabını Puppeteer yapar)
    const allCookies = req.cookies.getAll()
    if (allCookies.length > 0) {
      await page.setCookie(
        ...allCookies.map(c => ({
          name:  c.name,
          value: c.value,
          url:   targetUrl.origin,
          path:  '/',
        }))
      )
    }

    // A4 render genişliği için viewport (1200x1697, 2x scale)
    await page.setViewport({ width: 1200, height: 1697, deviceScaleFactor: 2 })

    await page.goto(targetUrl.toString(), { waitUntil: 'networkidle0', timeout: 30000 })

    // Auth redirect kontrolü — Puppeteer üye giriş sayfasını render etmemeli
    if (page.url().includes('/giris')) {
      await browser.close()
      throw new Error('PDF render auth redirect: /giris')
    }

    // Animasyon ve web font yüklenme bekleme süresi
    await new Promise(r => setTimeout(r, 1000))

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      displayHeaderFooter: false,
    })

    await browser.close()

    const fileName = `Finrate_Rapor_${type === 'executive15' ? '15P' : '8P'}_Analiz_${id}.pdf`
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    const correlationId = crypto.randomUUID()
    console.error('[pdf] error:', { correlationId, error: err instanceof Error ? err.message : String(err) })
    return jsonUtf8({ error: 'PDF oluşturulamadı.', correlationId }, { status: 500 })
  }
}
