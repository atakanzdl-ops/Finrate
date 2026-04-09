import { NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import path from 'node:path'

export async function GET() {
  const dbPath = path.join(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/')
  return jsonUtf8({ status: 'ok', cwd: process.cwd(), dbPath, DATABASE_URL: process.env.DATABASE_URL })
}
