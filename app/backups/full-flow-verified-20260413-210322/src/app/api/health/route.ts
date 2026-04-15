import { jsonUtf8 } from '@/lib/http/jsonUtf8'

export async function GET() {
  return jsonUtf8({ status: 'ok', timestamp: Date.now() })
}
