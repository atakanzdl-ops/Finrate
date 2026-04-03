import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const DB_URL = 'file:C:/finrate/app/prisma/dev.db'

const adapter = new PrismaLibSql({ url: DB_URL })

export const prisma = new PrismaClient({ adapter })
export default prisma
