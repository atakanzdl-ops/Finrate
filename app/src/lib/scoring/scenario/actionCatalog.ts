import type { ActionId, ActionTemplate } from './contracts'

export const ACTION_CATALOG: Record<ActionId, ActionTemplate> = {
  // A01 — Kısa Vadeli Finansal Borcu Uzun Vadeye Çevir
  A01_ST_FIN_DEBT_TO_LT: {
    id: "A01_ST_FIN_DEBT_TO_LT",
    name: "Kısa Vadeli Finansal Borcu Uzun Vadeye Çevir",
    sourceGroup: "SHORT_TERM_LIABILITIES",
    targetGroup: "LONG_TERM_LIABILITIES",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.05,
      suggestedPct: 0.10,
      maxPct: 0.30,
    },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [
      {
        sourceAccountPrefixes: ["300", "303", "304"],
        targetAccountPrefixes: ["400", "403", "404"],
        mappingMode: "ONE_TO_ONE_PREFIX",
        note: "KV banka kredileri → UV banka kredileri",
      },
    ],
    preconditions: [
      { key: "group.SHORT_TERM_LIABILITIES.account.300", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "MEDIUM",
    },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "LOW" },
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.65,
    implementationCostIndex: 0.25,
    confidence: 0.80,
    conflictsWith: ["A04_CASH_PAYDOWN_ST"],
    synergiesWith: ["A14_FINANCE_COST_OPTIMIZATION"],
  },

  // A02 — Ticari Borcu Uzun Vadeye Yeniden Sınıfla
  A02_TRADE_PAYABLE_TO_LT: {
    id: "A02_TRADE_PAYABLE_TO_LT",
    name: "Ticari Borcu Uzun Vadeye Yeniden Sınıfla",
    sourceGroup: "SHORT_TERM_LIABILITIES",
    targetGroup: "LONG_TERM_LIABILITIES",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.05,
      suggestedPct: 0.12,
      maxPct: 0.25,
    },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [
      {
        sourceAccountPrefixes: ["320", "321"],
        targetAccountPrefixes: ["420", "421"],
        mappingMode: "ONE_TO_ONE_PREFIX",
      },
    ],
    preconditions: [
      { key: "group.SHORT_TERM_LIABILITIES.account.320", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "LOW",
    },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "NET_WORKING_CAPITAL_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.55,
    implementationCostIndex: 0.30,
    confidence: 0.70,
    conflictsWith: [],
    synergiesWith: [],
  },

  // A03 — Alınan Avansları Uzun Vadeye Çevir
  A03_ADVANCE_TO_LT: {
    id: "A03_ADVANCE_TO_LT",
    name: "Alınan Avansları Uzun Vadeye Çevir",
    sourceGroup: "SHORT_TERM_LIABILITIES",
    targetGroup: "LONG_TERM_LIABILITIES",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.05,
      suggestedPct: 0.10,
      maxPct: 0.35,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["340"],
        targetAccountPrefixes: ["440"],
        mappingMode: "ONE_TO_ONE_PREFIX",
        note: "Alınan sipariş avansları KV → UV",
      },
    ],
    preconditions: [
      { key: "group.SHORT_TERM_LIABILITIES.account.340", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "HIGH", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM",
      SERVICES: "HIGH", RETAIL: "MEDIUM", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "NET_WORKING_CAPITAL_RATIO", expectedDirection: "UP", strength: "HIGH" },
    ],
    baseManageability: 0.60,
    implementationCostIndex: 0.20,
    confidence: 0.75,
    conflictsWith: [],
    synergiesWith: ["A01_ST_FIN_DEBT_TO_LT"],
  },

  // A04 — Nakit ile KV Borç Kapat
  A04_CASH_PAYDOWN_ST: {
    id: "A04_CASH_PAYDOWN_ST",
    name: "Nakit ile Kısa Vadeli Borç Kapat",
    sourceGroup: "CURRENT_ASSETS",
    targetGroup: "SHORT_TERM_LIABILITIES",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.02,
      suggestedPct: 0.08,
      maxPct: 0.20,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["102"],
        targetAccountPrefixes: ["300", "320"],
        mappingMode: "ONE_TO_MANY",
      },
    ],
    preconditions: [
      { key: "group.CURRENT_ASSETS.account.102", operator: ">", value: 0 },
      { key: "ratio.CASH_RATIO", operator: ">", value: 0.15 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM",
      SERVICES: "MEDIUM", RETAIL: "LOW", IT: "MEDIUM",
    },
    expectedKpiEffects: [
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "MEDIUM" },
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "DOWN", strength: "MEDIUM" },
    ],
    baseManageability: 0.80,
    implementationCostIndex: 0.10,
    confidence: 0.90,
    conflictsWith: ["A01_ST_FIN_DEBT_TO_LT"],
    synergiesWith: [],
  },

  // A05 — Alacak Tahsili Hızlandır
  A05_RECEIVABLE_COLLECTION: {
    id: "A05_RECEIVABLE_COLLECTION",
    name: "Alacak Tahsili Hızlandır",
    sourceGroup: "CURRENT_ASSETS",
    targetGroup: "CURRENT_ASSETS",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.03,
      suggestedPct: 0.10,
      maxPct: 0.25,
    },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [
      {
        sourceAccountPrefixes: ["120", "121"],
        targetAccountPrefixes: ["102"],
        mappingMode: "MANY_TO_ONE",
      },
    ],
    preconditions: [
      { key: "group.CURRENT_ASSETS.account.120", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "HIGH", RETAIL: "HIGH", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "HIGH" },
    ],
    baseManageability: 0.70,
    implementationCostIndex: 0.25,
    confidence: 0.75,
    conflictsWith: [],
    synergiesWith: [],
  },

  // A06 — Stok Optimizasyonu
  A06_INVENTORY_OPTIMIZATION: {
    id: "A06_INVENTORY_OPTIMIZATION",
    name: "Stok Optimizasyonu",
    sourceGroup: "CURRENT_ASSETS",
    targetGroup: "CURRENT_ASSETS",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.03,
      suggestedPct: 0.08,
      maxPct: 0.20,
    },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [
      {
        sourceAccountPrefixes: ["150", "151", "153"],
        targetAccountPrefixes: ["102"],
        mappingMode: "MANY_TO_ONE",
      },
    ],
    preconditions: [
      { key: "group.CURRENT_ASSETS.account.153", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "LOW", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "LOW",
    },
    expectedKpiEffects: [
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.60,
    implementationCostIndex: 0.35,
    confidence: 0.70,
    conflictsWith: [],
    synergiesWith: [],
  },

  // A07 — Peşin Giderleri Serbest Bırak
  A07_PREPAID_EXPENSE_RELEASE: {
    id: "A07_PREPAID_EXPENSE_RELEASE",
    name: "Peşin Giderleri Serbest Bırak",
    sourceGroup: "CURRENT_ASSETS",
    targetGroup: "CURRENT_ASSETS",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.02,
      suggestedPct: 0.06,
      maxPct: 0.15,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["180"],
        targetAccountPrefixes: ["102"],
        mappingMode: "ONE_TO_ONE_PREFIX",
      },
    ],
    preconditions: [
      { key: "group.CURRENT_ASSETS.account.180", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM",
      SERVICES: "MEDIUM", RETAIL: "MEDIUM", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "LOW" },
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "LOW" },
    ],
    baseManageability: 0.50,
    implementationCostIndex: 0.20,
    confidence: 0.65,
    conflictsWith: [],
    synergiesWith: [],
  },

  // A08 — Atıl Maddi Duran Varlık Satışı
  A08_FIXED_ASSET_DISPOSAL: {
    id: "A08_FIXED_ASSET_DISPOSAL",
    name: "Atıl Maddi Duran Varlık Satışı",
    sourceGroup: "NON_CURRENT_ASSETS",
    targetGroup: "CURRENT_ASSETS",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.02,
      suggestedPct: 0.07,
      maxPct: 0.20,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["250", "252", "253"],
        targetAccountPrefixes: ["102"],
        mappingMode: "MANY_TO_ONE",
      },
    ],
    preconditions: [
      { key: "group.NON_CURRENT_ASSETS.total", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "LOW",
      SERVICES: "LOW", RETAIL: "LOW", IT: "LOW",
    },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.45,
    implementationCostIndex: 0.45,
    confidence: 0.55,
    conflictsWith: ["A09_SALE_LEASEBACK"],
    synergiesWith: [],
  },

  // A09 — Sat-Geri Kirala
  A09_SALE_LEASEBACK: {
    id: "A09_SALE_LEASEBACK",
    name: "Sat-Geri Kirala",
    sourceGroup: "NON_CURRENT_ASSETS",
    targetGroup: "CURRENT_ASSETS",
    amountRule: {
      basis: "ELIGIBLE_SOURCE_TOTAL",
      minPct: 0.03,
      suggestedPct: 0.10,
      maxPct: 0.30,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["252"],
        targetAccountPrefixes: ["102", "430", "431"],
        mappingMode: "ONE_TO_MANY",
        note: "Bina satışı → nakit + UV kira yükümlülüğü",
      },
    ],
    preconditions: [
      { key: "group.NON_CURRENT_ASSETS.account.252", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "HIGH", MANUFACTURING: "MEDIUM", TRADE: "LOW",
      SERVICES: "LOW", RETAIL: "MEDIUM", IT: "LOW",
    },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "HIGH" },
    ],
    baseManageability: 0.50,
    implementationCostIndex: 0.55,
    confidence: 0.60,
    conflictsWith: ["A08_FIXED_ASSET_DISPOSAL"],
    synergiesWith: [],
  },

  // A10 — Sermaye Artırımı
  A10_EQUITY_INJECTION: {
    id: "A10_EQUITY_INJECTION",
    name: "Sermaye Artırımı",
    sourceGroup: "EXTERNAL",
    targetGroup: "EQUITY",
    amountRule: {
      basis: "BALANCE_SHEET_TOTAL",
      minPct: 0.02,
      suggestedPct: 0.08,
      maxPct: 0.25,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["EXTERNAL"],
        targetAccountPrefixes: ["500"],
        mappingMode: "ONE_TO_ONE_PREFIX",
        note: "Dış nakit girişi → ödenmiş sermaye + kasa",
      },
    ],
    preconditions: [],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM",
      SERVICES: "MEDIUM", RETAIL: "MEDIUM", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "HIGH" },
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.40,
    implementationCostIndex: 0.60,
    confidence: 0.70,
    conflictsWith: [],
    synergiesWith: ["A11_EARNINGS_RETENTION"],
  },

  // A11 — Kârı Dağıtma / Geçmiş Yıl Kârlarında Tut
  A11_EARNINGS_RETENTION: {
    id: "A11_EARNINGS_RETENTION",
    name: "Kârı Şirkette Tut",
    sourceGroup: "INCOME_STATEMENT",
    targetGroup: "EQUITY",
    amountRule: {
      basis: "INCOME_STATEMENT_TOTAL",
      minPct: 0.20,
      suggestedPct: 0.60,
      maxPct: 1.00,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["590"],
        targetAccountPrefixes: ["570"],
        mappingMode: "ONE_TO_ONE_PREFIX",
      },
    ],
    preconditions: [
      { key: "group.EQUITY.account.590", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "HIGH", RETAIL: "HIGH", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "MEDIUM" },
    ],
    baseManageability: 0.85,
    implementationCostIndex: 0.10,
    confidence: 0.90,
    conflictsWith: [],
    synergiesWith: ["A10_EQUITY_INJECTION"],
  },

  // A12 — Brüt Kâr Marjı İyileştirme
  A12_GROSS_MARGIN_IMPROVEMENT: {
    id: "A12_GROSS_MARGIN_IMPROVEMENT",
    name: "Brüt Kâr Marjı İyileştir",
    sourceGroup: "INCOME_STATEMENT",
    targetGroup: "EQUITY",
    amountRule: {
      basis: "REVENUE_TOTAL",
      minPct: 0.01,
      suggestedPct: 0.03,
      maxPct: 0.08,
    },
    distributionDefault: "PROPORTIONAL",
    accountMappings: [
      {
        sourceAccountPrefixes: ["620", "621", "622"],
        targetAccountPrefixes: ["590"],
        mappingMode: "MANY_TO_ONE",
        note: "SMM azaltımı → net kâr artışı",
      },
    ],
    preconditions: [
      { key: "group.INCOME_STATEMENT.account.600", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "HIGH", RETAIL: "MEDIUM", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "LOW" },
    ],
    baseManageability: 0.55,
    implementationCostIndex: 0.40,
    confidence: 0.65,
    conflictsWith: [],
    synergiesWith: ["A13_OPEX_OPTIMIZATION"],
  },

  // A13 — OPEX Optimizasyonu
  A13_OPEX_OPTIMIZATION: {
    id: "A13_OPEX_OPTIMIZATION",
    name: "Faaliyet Giderlerini Düşür",
    sourceGroup: "INCOME_STATEMENT",
    targetGroup: "EQUITY",
    amountRule: {
      basis: "REVENUE_TOTAL",
      minPct: 0.01,
      suggestedPct: 0.04,
      maxPct: 0.10,
    },
    distributionDefault: "PROPORTIONAL",
    accountMappings: [
      {
        sourceAccountPrefixes: ["630", "631", "632"],
        targetAccountPrefixes: ["590"],
        mappingMode: "MANY_TO_ONE",
      },
    ],
    preconditions: [
      { key: "group.INCOME_STATEMENT.account.632", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM",
      SERVICES: "HIGH", RETAIL: "MEDIUM", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "LOW" },
    ],
    baseManageability: 0.60,
    implementationCostIndex: 0.35,
    confidence: 0.70,
    conflictsWith: [],
    synergiesWith: ["A12_GROSS_MARGIN_IMPROVEMENT"],
  },

  // A14 — Finansman Gideri Optimizasyonu
  A14_FINANCE_COST_OPTIMIZATION: {
    id: "A14_FINANCE_COST_OPTIMIZATION",
    name: "Finansman Giderini Düşür",
    sourceGroup: "INCOME_STATEMENT",
    targetGroup: "EQUITY",
    amountRule: {
      basis: "INCOME_STATEMENT_TOTAL",
      minPct: 0.05,
      suggestedPct: 0.12,
      maxPct: 0.30,
    },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [
      {
        sourceAccountPrefixes: ["660", "661"],
        targetAccountPrefixes: ["590"],
        mappingMode: "MANY_TO_ONE",
        note: "Finansman gideri düşüşü → net kâr artışı",
      },
    ],
    preconditions: [
      { key: "group.INCOME_STATEMENT.account.660", operator: ">", value: 0 },
    ],
    sectorFeasibility: {
      CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH",
      SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "HIGH",
    },
    expectedKpiEffects: [
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.60,
    implementationCostIndex: 0.30,
    confidence: 0.75,
    conflictsWith: [],
    synergiesWith: ["A01_ST_FIN_DEBT_TO_LT"],
  },
}

export function getActionTemplate(id: ActionId): ActionTemplate {
  return ACTION_CATALOG[id]
}

export function getAllActions(): ActionTemplate[] {
  return Object.values(ACTION_CATALOG)
}
