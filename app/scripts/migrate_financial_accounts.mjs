/**
 * Faz A2 Migration — FinancialData aggregate → FinancialAccount (hesap kodu bazlı)
 *
 * Mevcut tüm Analysis kayıtları için financialData alanından FinancialAccount
 * tablosuna veri aktarır. Zaten migrate edilmiş analizler atlanır (idempotent).
 *
 * Çalıştırma:
 *   node scripts/migrate_financial_accounts.mjs
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg }    from '@prisma/adapter-pg'
import { Pool }        from 'pg'
import { readFileSync } from 'fs'
import { resolve }     from 'path'

// .env dosyasından DATABASE_URL yükle
try {
  const envPath = resolve(process.cwd(), '.env')
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const val = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch { /* .env yoksa ortam değişkenlerini kullan */ }

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter })

// ─── Mapper (accountMapper.ts'in JS karşılığı — import sınırlaması nedeniyle) ──

function mapFinancialDataToAccounts(fd) {
  const entries = []
  const add = (code, amount) => {
    if (amount != null && amount !== 0) entries.push({ code, amount: Number(amount) })
  }

  // DÖNEN VARLIKLAR
  add('102', fd.cash)
  add('120', fd.tradeReceivables)
  add('136', fd.otherReceivables)
  add('153', fd.inventory)
  add('159', fd.prepaidSuppliers ?? fd.advancesPaid)
  add('190', fd.otherCurrentAssets)

  // DURAN VARLIKLAR
  add('252', fd.tangibleAssets)
  add('260', fd.intangibleAssets)
  add('280', fd.otherNonCurrentAssets)

  // KISA VADELİ YABANCI KAYNAKLAR
  add('300', fd.shortTermFinancialDebt ?? fd.shortTermLoans)
  add('320', fd.tradePayables)
  add('336', fd.otherShortTermPayables ?? fd.otherShortTermLiabilities)
  add('340', fd.advancesReceived)
  add('360', fd.taxPayables)

  // UZUN VADELİ YABANCI KAYNAKLAR
  add('400', fd.longTermFinancialDebt ?? fd.longTermLoans)
  add('436', fd.otherNonCurrentLiabilities ?? fd.otherLongTermLiabilities)

  // ÖZKAYNAKLAR
  add('500', fd.paidInCapital)
  const retainedNet = (fd.retainedEarnings ?? 0) - (fd.retainedLosses ?? 0)
  if (retainedNet > 0) add('570', retainedNet)
  if (retainedNet < 0) add('580', Math.abs(retainedNet))
  const np = fd.netProfitCurrentYear ?? fd.netProfit
  if (np != null && np > 0) add('590', np)
  if (np != null && np < 0) add('591', Math.abs(np))

  // GELİR TABLOSU
  add('600', fd.revenue)
  add('621', fd.costOfSales ?? fd.cogs)
  add('632', fd.operatingExpenses)
  add('660', fd.interestExpense)

  return entries
}

// ─── Migration ────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('Faz A2 — FinancialData → FinancialAccount migration başlıyor...\n')

  const analyses = await prisma.analysis.findMany({
    include: { financialData: true },
  })

  console.log(`Toplam ${analyses.length} analiz bulundu.\n`)

  let totalMigrated = 0
  let totalSkipped  = 0
  let totalAccounts = 0

  for (const analysis of analyses) {
    if (!analysis.financialData) {
      console.log(`[NO DATA] ${analysis.id} — financialData yok, atlandı`)
      totalSkipped++
      continue
    }

    // Zaten migrate edilmişse atla (idempotent)
    const existing = await prisma.financialAccount.count({
      where: { analysisId: analysis.id },
    })
    if (existing > 0) {
      console.log(`[SKIP] ${analysis.id} — zaten ${existing} hesap kaydı var`)
      totalSkipped++
      continue
    }

    const fd      = analysis.financialData
    const entries = mapFinancialDataToAccounts(fd)

    if (entries.length === 0) {
      console.log(`[EMPTY] ${analysis.id} — tüm alanlar null/0, atlandı`)
      totalSkipped++
      continue
    }

    await prisma.financialAccount.createMany({
      data: entries.map(e => ({
        analysisId:  analysis.id,
        accountCode: e.code,
        accountName: '',   // chartOfAccounts'tan sonraki fazda doldurulur
        amount:      e.amount,
      })),
    })

    console.log(`[OK] ${analysis.id} — ${entries.length} hesap kaydı eklendi`)
    totalMigrated++
    totalAccounts += entries.length
  }

  console.log('\n─────────────────────────────────────')
  console.log('✓ Migration tamamlandı')
  console.log(`  Migrate edilen  : ${totalMigrated} analiz`)
  console.log(`  Atlanan         : ${totalSkipped} analiz`)
  console.log(`  Toplam kayıt    : ${totalAccounts} FinancialAccount`)
  console.log('─────────────────────────────────────')

  await prisma.$disconnect()
}

migrate().catch(async (err) => {
  console.error('Migration hatası:', err)
  await prisma.$disconnect()
  process.exit(1)
})
