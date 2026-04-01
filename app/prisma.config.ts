import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://finrate_user:finrate123@localhost:5432/finrate_db',
  },
})
