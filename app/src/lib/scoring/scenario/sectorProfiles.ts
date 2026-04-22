import type { SectorCode, SectorProfile } from './contracts'

export const SECTOR_PROFILES: Record<SectorCode, SectorProfile> = {
  CONSTRUCTION: {
    sector: "CONSTRUCTION",
    normalRanges: {
      customerAdvancesShareOfSTL: { min: 0.35, median: 0.55, max: 0.72 },
      inventoryShareOfCurrentAssets: { min: 0.05, median: 0.12, max: 0.22 },
      receivablesShareOfCurrentAssets: { min: 0.15, median: 0.28, max: 0.40 },
      tradePayablesShareOfSTL: { min: 0.12, median: 0.24, max: 0.36 },
    },
    priorityActions: [
      "A03_ADVANCE_TO_LT",
      "A01_ST_FIN_DEBT_TO_LT",
      "A09_SALE_LEASEBACK",
      "A14_FINANCE_COST_OPTIMIZATION",
    ],
    discouragedActions: ["A06_INVENTORY_OPTIMIZATION"],
    blockedActions: [],
    warningRules: [
      {
        id: "CNS_01",
        when: [{ key: "metric.customerAdvancesShareOfSTL", operator: ">", value: 0.70 }],
        severity: "INFO",
        message: "Yüksek avans oranı inşaatta operasyonel model kaynaklı olabilir.",
      },
      {
        id: "CNS_02",
        when: [{ key: "ratio.CURRENT_RATIO", operator: "<", value: 1.0 }],
        severity: "CRITICAL",
        message: "Likidite stresi: KVYK vadeleri öncelikli ele alınmalı.",
      },
    ],
  },

  MANUFACTURING: {
    sector: "MANUFACTURING",
    normalRanges: {
      customerAdvancesShareOfSTL: { min: 0.02, median: 0.08, max: 0.18 },
      inventoryShareOfCurrentAssets: { min: 0.22, median: 0.34, max: 0.48 },
      receivablesShareOfCurrentAssets: { min: 0.20, median: 0.30, max: 0.42 },
      tradePayablesShareOfSTL: { min: 0.24, median: 0.37, max: 0.50 },
    },
    priorityActions: [
      "A06_INVENTORY_OPTIMIZATION",
      "A02_TRADE_PAYABLE_TO_LT",
      "A14_FINANCE_COST_OPTIMIZATION",
    ],
    discouragedActions: [],
    blockedActions: [],
    warningRules: [
      {
        id: "MFG_01",
        when: [{ key: "metric.inventoryShareOfCurrentAssets", operator: ">", value: 0.50 }],
        severity: "WARN",
        message: "Stok yoğunluğu yüksek, işletme sermayesi baskısı artıyor.",
      },
    ],
  },

  TRADE: {
    sector: "TRADE",
    normalRanges: {
      customerAdvancesShareOfSTL: { min: 0.01, median: 0.06, max: 0.14 },
      inventoryShareOfCurrentAssets: { min: 0.28, median: 0.40, max: 0.55 },
      receivablesShareOfCurrentAssets: { min: 0.14, median: 0.24, max: 0.36 },
      tradePayablesShareOfSTL: { min: 0.30, median: 0.44, max: 0.58 },
    },
    priorityActions: [
      "A06_INVENTORY_OPTIMIZATION",
      "A02_TRADE_PAYABLE_TO_LT",
      "A05_RECEIVABLE_COLLECTION",
    ],
    discouragedActions: [],
    blockedActions: [],
    warningRules: [
      {
        id: "TRD_01",
        when: [{ key: "ratio.QUICK_RATIO", operator: "<", value: 0.8 }],
        severity: "WARN",
        message: "Hızlı likidite zayıf, stok bağımlılığı yüksek.",
      },
    ],
  },

  SERVICES: {
    sector: "SERVICES",
    normalRanges: {
      customerAdvancesShareOfSTL: { min: 0.08, median: 0.20, max: 0.35 },
      inventoryShareOfCurrentAssets: { min: 0.00, median: 0.06, max: 0.14 },
      receivablesShareOfCurrentAssets: { min: 0.22, median: 0.36, max: 0.50 },
      tradePayablesShareOfSTL: { min: 0.18, median: 0.30, max: 0.42 },
    },
    priorityActions: [
      "A05_RECEIVABLE_COLLECTION",
      "A12_GROSS_MARGIN_IMPROVEMENT",
      "A13_OPEX_OPTIMIZATION",
    ],
    discouragedActions: ["A08_FIXED_ASSET_DISPOSAL", "A09_SALE_LEASEBACK"],
    blockedActions: [],
    warningRules: [
      {
        id: "SRV_01",
        when: [{ key: "metric.receivablesShareOfCurrentAssets", operator: ">", value: 0.50 }],
        severity: "WARN",
        message: "Tahsilat riski yüksek.",
      },
    ],
  },

  RETAIL: {
    sector: "RETAIL",
    normalRanges: {
      customerAdvancesShareOfSTL: { min: 0.00, median: 0.03, max: 0.08 },
      inventoryShareOfCurrentAssets: { min: 0.34, median: 0.46, max: 0.62 },
      receivablesShareOfCurrentAssets: { min: 0.03, median: 0.10, max: 0.20 },
      tradePayablesShareOfSTL: { min: 0.38, median: 0.52, max: 0.66 },
    },
    priorityActions: [
      "A06_INVENTORY_OPTIMIZATION",
      "A02_TRADE_PAYABLE_TO_LT",
      "A14_FINANCE_COST_OPTIMIZATION",
    ],
    discouragedActions: ["A03_ADVANCE_TO_LT"],
    blockedActions: [],
    warningRules: [
      {
        id: "RTL_01",
        when: [{ key: "metric.inventoryShareOfCurrentAssets", operator: ">", value: 0.60 }],
        severity: "CRITICAL",
        message: "Aşırı stok birikimi.",
      },
    ],
  },

  IT: {
    sector: "IT",
    normalRanges: {
      customerAdvancesShareOfSTL: { min: 0.12, median: 0.26, max: 0.45 },
      inventoryShareOfCurrentAssets: { min: 0.00, median: 0.02, max: 0.08 },
      receivablesShareOfCurrentAssets: { min: 0.28, median: 0.42, max: 0.58 },
      tradePayablesShareOfSTL: { min: 0.10, median: 0.18, max: 0.30 },
    },
    priorityActions: [
      "A05_RECEIVABLE_COLLECTION",
      "A12_GROSS_MARGIN_IMPROVEMENT",
      "A13_OPEX_OPTIMIZATION",
      "A11_EARNINGS_RETENTION",
    ],
    discouragedActions: ["A06_INVENTORY_OPTIMIZATION"],
    blockedActions: ["A08_FIXED_ASSET_DISPOSAL", "A09_SALE_LEASEBACK"],
    warningRules: [
      {
        id: "IT_01",
        when: [{ key: "metric.customerAdvancesShareOfSTL", operator: "<", value: 0.10 }],
        severity: "INFO",
        message: "Ertelenmiş gelir/avans düşük, nakit öngörülebilirliği azalabilir.",
      },
    ],
  },
}

/**
 * Finrate sektör isimlerini Codex SectorCode'una çevirir.
 * Mevcut sistemdeki Türkçe sektör isimleri ile yeni enum arasında köprü.
 */
export function mapSectorToCode(sector: string | null | undefined): SectorCode {
  if (!sector) return "MANUFACTURING"
  const normalized = sector.trim().toLowerCase()

  if (normalized.includes("inşaat") || normalized.includes("insaat")) return "CONSTRUCTION"
  if (normalized.includes("imalat") || normalized.includes("üretim") || normalized.includes("uretim")) return "MANUFACTURING"
  if (normalized.includes("ticaret") || normalized.includes("toptan")) return "TRADE"
  if (normalized.includes("hizmet")) return "SERVICES"
  if (normalized.includes("perakende") || normalized.includes("mağaza") || normalized.includes("magaza")) return "RETAIL"
  if (normalized.includes("bilişim") || normalized.includes("bilisim") || normalized.includes("yazılım") || normalized.includes("yazilim") || normalized.includes("teknoloji")) return "IT"

  return "MANUFACTURING" // varsayılan
}

export function getSectorProfile(sector: string | null | undefined): SectorProfile {
  const code = mapSectorToCode(sector)
  return SECTOR_PROFILES[code]
}
