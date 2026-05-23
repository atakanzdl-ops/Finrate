# Scenario V3 Engine Test Pattern

Bu kılavuz R6 ve R7A süreçlerinde öğrenilen ders ve pattern'leri belgeler.
Yeni computeAmount / buildTransactions eklenirken bu pattern uygulanmalıdır.

---

## R6 Dersi: Birim Test Yetmez

computeAmount direkt çağrı PASS olsa bile, engine üzerinden gerçek davranış
FAIL olabilir. R6 push'unda yaşandı:

- `a04NakitGuard.test.ts` → 7 test PASS (birim)
- Canlıda → ORGANIKA için 6.8M öneri (BUG)
- Sebep: Engine greedy loop context'i iteratif günceller; A04 şişirilmiş
  nakiti görür. Düzeltme: `baselineAccountBalances` (R6 Hotfix 2).

**Her birim test için bir entegrasyon testi zorunludur.**

---

## R7A Dersi: Sessiz Guardrail Düşüşü

computeAmount 1.71M üretiyor, birim test PASS. Ama canlıda A14 görünmüyor.
Kök neden: `semanticGuardrails` sourceAccountRequirements '780' hard —
ORGANIKA'da 780=0 → score=0 → `rejectedLog`'a yazılmadan sessizce düşüyor.

**Her yeni fallback fonksiyonu için semanticGuardrails güncellemesi gerekir.**
Düzeltme: `allowComputedSource: true` (R7A).

---

## Zorunlu Test Pattern

### 1. Aksiyon Erişimi — named export YOK

```ts
// YASAK:
import { A14_FINANCE_COST_REDUCTION } from '../actionCatalogV3'  // ❌

// DOĞRU:
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
const a14 = ACTION_CATALOG_V3['A14_FINANCE_COST_REDUCTION']
```

### 2. Birim Test — `?.` operatörü tuzağı

```ts
// YASAK:
expect(a14.computeAmount?.(ctx)).toBeNull()  // ❌ undefined → yanlış PASS

// DOĞRU:
expect(a14.computeAmount).toBeDefined()          // önce tanımlı kontrol
expect(a14.computeAmount!(ctx)).toBeNull()        // ! operatörü kullan
```

### 3. Engine Entegrasyon Testi — EngineInput şeması

`runEngineV3` tek argüman alır, `firmContext` sarmalama YOKTUR:

```ts
import { runEngineV3 } from '../engineV3'
import type { EngineInput } from '../engineV3'

const result = runEngineV3({
  sector:          'MANUFACTURING',
  currentRating:   'B',
  targetRating:    'BBB',
  accountBalances: { '300': 22_800_000 },
  incomeStatement: {
    netSales:        38_000_000,
    costOfGoodsSold: 28_000_000,
    grossProfit:     10_000_000,
    operatingProfit:  5_000_000,
    netIncome:        2_000_000,
    interestExpense:  2_000_000,
  },
  options: {
    allowedActionIds: ['A14_FINANCE_COST_REDUCTION'],
  },
})
```

### 4. Sonuç Alanları

```ts
// portfolio: seçilen aksiyonlar — actionId + amountTRY
const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
expect(a14).toBeDefined()
expect(a14?.amountTRY).toBeGreaterThan(1_000_000)

// debug.rejectedCandidates: reddedilen aksiyonlar (R7A'dan itibaren hard reject dahil)
const rejected = result.debug?.rejectedCandidates?.find(
  r => r.actionId === 'A14_FINANCE_COST_REDUCTION'
)
// Portfolyoda YOK ve rejected'da da YOK → sessiz düşüş (R7A bug)
```

### 5. allowedActionIds ile İzole Test

Belirli aksiyonları izole test etmek için:

```ts
options: {
  allowedActionIds: ['A20_GROSS_MARGIN_REFORM', 'A04_CASH_PAYDOWN_ST'],
}
```

Bu A20→A04 bug zincirini test eder (R6 Hotfix 2 dersi).

---

## Gerçek Firma Profilleri

Test için doğrulanmış profiller:

| Firma     | Kritik Değerler                          | Test Amacı                       |
|-----------|------------------------------------------|----------------------------------|
| ENES      | 102=222 TL, 300=12M                      | A04 nakit guard                  |
| ORGANIKA  | 102=960K, 300=22.8M, 780 yok             | A04 %15 guard + A14 KOBİ fallback|
| DEKAM     | grossProfit=-22.5M, 340=15M, 780=5.37M  | A19 brüt zarar + A14 sektör altı |
| iPOS      | 255=13.4M, 252=0                         | A09 prefix bug guard             |
| İSRA      | TRADE, B, sentetik KOBİ                  | R8.1 baseline referans           |

---

## R8.1 Smoke Test Otomasyon

5 firma × 3 hedef = 15 senaryo baseline testi.

```bash
# Sadece smoke testleri çalıştır:
npm run test:smoke

# veya doğrudan:
npx jest --testPathPatterns=smokeTests --verbose
```

### Fixture Dosyaları

- `fixtures/smoke/inputs.ts` — 5 firma `EngineInput` sabiti
- `smokeTests.test.ts` — 15 test + universal invariant helper

### Universal Invariantlar

Her smoke senaryosunda otomatik çalışan `assertUniversalSmoke()`:

```ts
// 1 — A11 disable (özkaynak yanılgısı — R7B)
expect(result.portfolio.find(a => a.actionId === 'A11_RETAIN_EARNINGS')).toBeUndefined()

// 2 — 320 yasak (Satıcılar avans teslimatında kullanılmaz — R7B mini)
const leg320 = allLegs.find(l => l.accountCode === '320')
expect(leg320).toBeUndefined()

// 3 — DEBIT == CREDIT (çift taraflı kayıt denkliği)
expect(debit).toBe(credit)

// 4 — amountTRY > 0 (negatif/sıfır aksiyon yok)
expect(action.amountTRY).toBeGreaterThan(0)

// 5 — 690 ↔ 590 profit transfer zinciri
// 690 DEBIT varsa 590 CREDIT aynı tx'da olmalı
expect(has590Credit).toBe(true)
```

### Senaryo Bazlı Guard'lar

| Firma    | Aksiyon               | Beklenen   | Sebep                                    |
|----------|-----------------------|------------|------------------------------------------|
| DEKAM    | A19_ADVANCE_TO_REVENUE| DIŞARI     | baselineGrossProfit < 0 (brüt zarar)     |
| DEKAM    | A14_FINANCE_COST_*    | DIŞARI     | 780/netSales=%1.64 < %5 CONSTRUCTION     |
| ORGANIKA | A04_CASH_PAYDOWN_ST   | DIŞARI     | 102=960K → %4.2 < %15 nakit guard        |
| ORGANIKA | A14_FINANCE_COST_*    | İÇERİDE    | KOBİ fallback %32 > %20 + allowComputed  |
| ENES     | A04_CASH_PAYDOWN_ST   | DIŞARI     | 102=222 TL → nakitCap ≈ 0                |
| iPOS     | A09_SALE_LEASEBACK    | DIŞARI     | bina(252)=0 → havuz=0 (R6 prefix fix)    |

---

## Baseline Guard Pattern (R6 Hotfix 2)

Greedy loop context'i iteratif değiştirir. Bazı aksiyonlar **analiz başındaki**
değerlere bakmalıdır:

```ts
// A04 computeAmount — greedy loop nakiti şişirmiş olabilir
const baseline = ctx.baselineAccountBalances ?? ctx.accountBalances ?? {}
const mevcutNakit = baseline['102'] ?? 0

// A19 buildTransactions — A20 grossProfit'i pozitife çekmiş olabilir
const baselineGrossProfit = context.baselineGrossProfit ?? context.grossProfit ?? 0
if (baselineGrossProfit <= 0) return []
```

`baselineAccountBalances`, `baselineGrossProfit`, `baselineNetSales` alanları
`buildInitialFirmContext`'te frozen olarak set edilir ve `updateFirmContextFromTransactions`
tarafından değiştirilmez.

---

## allowComputedSource Guard Pattern (R7A)

KOBİ firmalarında 780 (Finansman Giderleri), 632/633/634 (Faaliyet Giderleri),
621 (SMM) gibi hesaplar olmayabilir. `ratioHelpers.ts`'deki helper fonksiyonlar
bu durum için fallback üretir. `semanticGuardrails.ts` hard source check'i bu
fallback'ten habersizdir.

Çözüm: `ActionDependencySpec.allowComputedSource: true` flag'i.

```ts
// semanticGuardrails.ts ACTION_DEPENDENCY_GRAPH
A14_FINANCE_COST_REDUCTION: {
  sourceAccountRequirements: ['780'],
  allowComputedSource: true,  // 780 yoksa 300/400 × %25 fallback geçerli
  ...
},
```

**Yeni fallback'li aksiyon eklendiğinde** bu flag'i eklemeyi unutma.
