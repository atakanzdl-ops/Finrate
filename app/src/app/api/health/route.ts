import { NextResponse } from 'next/server'
import path from 'node:path'

export async function GET() {
  const dbPath = path.join(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/')
  return NextResponse.json({ status: 'ok', cwd: process.cwd(), dbPath, DATABASE_URL: process.env.DATABASE_URL })
}
