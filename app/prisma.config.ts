import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:C:/finrate/app/prisma/dev.db',
  },
})
