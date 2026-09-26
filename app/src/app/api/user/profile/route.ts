import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { isValidOptionalTaxNumber, normalizeTaxNumber } from '@/lib/validation/taxNumber'

export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

    const { fullName, companyName, taxNumber } = await req.json()

    if (taxNumber !== undefined && !isValidOptionalTaxNumber(taxNumber)) {
      return jsonUtf8({ error: 'Vergi numarası 10 hane, TC kimlik numarası 11 hane olmalıdır.' }, { status: 400 })
    }
    const tax = taxNumber !== undefined ? normalizeTaxNumber(taxNumber) : undefined

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName    && { fullName: fullName.trim() }),
        ...(companyName !== undefined && { companyName: companyName?.trim() || null }),
        ...(tax !== undefined && { taxNumber: tax }),
      },
      select: { id: true, email: true, fullName: true, companyName: true, taxNumber: true },
    })

    return jsonUtf8({ user })
  } catch {
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
