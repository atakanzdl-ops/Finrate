import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET: string = process.env.JWT_SECRET ?? (() => {
  throw new Error('JWT_SECRET environment variable is not set. Set it before starting the server.')
})()
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function getUserIdFromRequest(req: import('next/server').NextRequest): string | null {
  try {
    // 1) Cookie
    const cookieToken = req.cookies.get('finrate_token')?.value
    if (cookieToken) return verifyToken(cookieToken).userId

    // 2) Authorization: Bearer <token>
    const authHeader = req.headers.get('authorization') ?? ''
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      return verifyToken(token).userId
    }
    return null
  } catch {
    return null
  }
}
