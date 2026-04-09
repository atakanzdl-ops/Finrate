import { NextResponse } from 'next/server'

import { jsonUtf8 } from '@/lib/http/jsonUtf8'
export async function POST() {
  const response = jsonUtf8({ success: true })
  response.cookies.set('finrate_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
