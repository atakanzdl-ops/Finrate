import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { getUserIdFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import puppeteer from 'puppeteer'

type ReportType = 'standard8' | 'executive15'

function resolveReportType(rawType: string | null, plan: string | null): ReportType {
  return plan === 'PRO' ? 'executive15' : 'standard8'
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const requestedType = req.nextUrl.searchParams.get('type')
  const cookieToken = req.cookies.get('finrate_token')?.value
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true },
  })
  const type = resolveReportType(requestedType, subscription?.plan ?? null)

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const targetUrl = `${baseUrl}/dashboard/analiz/rapor?id=${id}&type=${type}&print=1`
    
    // Auth bypass via cookie
    if (cookieToken) {
      const urlObj = new URL(baseUrl)
      await page.setCookie({
        name: 'finrate_token',
        value: cookieToken,
        domain: urlObj.hostname,
        path: '/'
      })
    }

    // Set viewport explicitly for A4 rendering width (1200x1697)
    await page.setViewport({ width: 1200, height: 1697, deviceScaleFactor: 2 })

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 })
    
    // Wait for animations and webfonts
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
  } catch (err: any) {
    console.error('Puppeteer PDF Generation Error:', err)
    return jsonUtf8({ error: 'PDF oluşturulamadı. Sunucu konsolunu kontrol edin.', details: err.message }, { status: 500 })
  }
}
