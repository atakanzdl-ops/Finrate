import { prisma } from '../src/lib/db'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Veritabanı JSON yedeği: iş verisi tabloları (kullanıcı şifreleri HARİÇ) tek dosyaya yazılır.
//   npm run backup:db   (= tsx --env-file=.env.local scripts/backup-db.ts) → backups/db/<tarih-saat>.json
//   BACKUP_DIR=... ile hedef klasör değiştirilebilir.
// backups/ klasörü git'e girmez (.gitignore). Geri yükleme: prisma ile tablo tablo createMany.

async function main() {
  const dir = process.env.BACKUP_DIR ?? join(process.cwd(), 'backups', 'db')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = join(dir, `finrate-${stamp}.json`)

  const [users, subscriptions, entities, groups, financialData, financialAccounts, analyses, subjectiveInputs, tenzilat, manualAdjustments] =
    await Promise.all([
      prisma.user.findMany({ select: { id: true, email: true, fullName: true, companyName: true, role: true, isVerified: true, isActive: true, createdAt: true } }),
      prisma.subscription.findMany(),
      prisma.entity.findMany(),
      prisma.group.findMany(),
      prisma.financialData.findMany(),
      prisma.financialAccount.findMany(),
      prisma.analysis.findMany(),
      prisma.subjectiveInput.findMany(),
      prisma.tenzilatEntry.findMany(),
      prisma.manualAdjustment.findMany(),
    ])

  const payload = {
    createdAt: new Date().toISOString(),
    counts: {
      users: users.length, subscriptions: subscriptions.length, entities: entities.length, groups: groups.length,
      financialData: financialData.length, financialAccounts: financialAccounts.length, analyses: analyses.length,
      subjectiveInputs: subjectiveInputs.length, tenzilat: tenzilat.length, manualAdjustments: manualAdjustments.length,
    },
    users, subscriptions, entities, groups, financialData, financialAccounts, analyses, subjectiveInputs, tenzilat, manualAdjustments,
  }
  writeFileSync(file, JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2), 'utf-8')
  console.log(`Yedek yazıldı: ${file}`)
  console.table(payload.counts)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
