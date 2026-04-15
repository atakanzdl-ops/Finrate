-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "companyName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'DEMO',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "iyzicoSubKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" TEXT NOT NULL,
    "iyzicoPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxNumber" TEXT,
    "sector" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'STANDALONE',
    "groupId" TEXT,
    "ownershipPct" DOUBLE PRECISION,
    "consolidationInclude" BOOLEAN NOT NULL DEFAULT true,
    "weightBasis" TEXT NOT NULL DEFAULT 'REVENUE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'TRY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_data" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ANNUAL',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "fileName" TEXT,
    "fileUrl" TEXT,
    "cash" DOUBLE PRECISION,
    "shortTermInvestments" DOUBLE PRECISION,
    "tradeReceivables" DOUBLE PRECISION,
    "otherReceivables" DOUBLE PRECISION,
    "inventory" DOUBLE PRECISION,
    "constructionCosts" DOUBLE PRECISION,
    "prepaidExpenses" DOUBLE PRECISION,
    "otherCurrentAssets" DOUBLE PRECISION,
    "totalCurrentAssets" DOUBLE PRECISION,
    "longTermTradeReceivables" DOUBLE PRECISION,
    "longTermOtherReceivables" DOUBLE PRECISION,
    "longTermInvestments" DOUBLE PRECISION,
    "tangibleAssets" DOUBLE PRECISION,
    "intangibleAssets" DOUBLE PRECISION,
    "depletableAssets" DOUBLE PRECISION,
    "longTermPrepaidExpenses" DOUBLE PRECISION,
    "otherNonCurrentAssets" DOUBLE PRECISION,
    "totalNonCurrentAssets" DOUBLE PRECISION,
    "totalAssets" DOUBLE PRECISION,
    "shortTermFinancialDebt" DOUBLE PRECISION,
    "tradePayables" DOUBLE PRECISION,
    "otherShortTermPayables" DOUBLE PRECISION,
    "advancesReceived" DOUBLE PRECISION,
    "constructionProgress" DOUBLE PRECISION,
    "taxPayables" DOUBLE PRECISION,
    "shortTermProvisions" DOUBLE PRECISION,
    "deferredRevenue" DOUBLE PRECISION,
    "otherCurrentLiabilities" DOUBLE PRECISION,
    "totalCurrentLiabilities" DOUBLE PRECISION,
    "longTermFinancialDebt" DOUBLE PRECISION,
    "longTermTradePayables" DOUBLE PRECISION,
    "longTermOtherPayables" DOUBLE PRECISION,
    "longTermAdvancesReceived" DOUBLE PRECISION,
    "longTermProvisions" DOUBLE PRECISION,
    "otherNonCurrentLiabilities" DOUBLE PRECISION,
    "totalNonCurrentLiabilities" DOUBLE PRECISION,
    "paidInCapital" DOUBLE PRECISION,
    "capitalReserves" DOUBLE PRECISION,
    "profitReserves" DOUBLE PRECISION,
    "retainedEarnings" DOUBLE PRECISION,
    "retainedLosses" DOUBLE PRECISION,
    "netProfitCurrentYear" DOUBLE PRECISION,
    "totalEquity" DOUBLE PRECISION,
    "totalLiabilitiesAndEquity" DOUBLE PRECISION,
    "grossSales" DOUBLE PRECISION,
    "salesDiscounts" DOUBLE PRECISION,
    "revenue" DOUBLE PRECISION,
    "cogs" DOUBLE PRECISION,
    "grossProfit" DOUBLE PRECISION,
    "operatingExpenses" DOUBLE PRECISION,
    "ebit" DOUBLE PRECISION,
    "otherIncome" DOUBLE PRECISION,
    "otherExpense" DOUBLE PRECISION,
    "interestExpense" DOUBLE PRECISION,
    "ebt" DOUBLE PRECISION,
    "extraordinaryIncome" DOUBLE PRECISION,
    "extraordinaryExpense" DOUBLE PRECISION,
    "taxExpense" DOUBLE PRECISION,
    "netProfit" DOUBLE PRECISION,
    "depreciation" DOUBLE PRECISION,
    "ebitda" DOUBLE PRECISION,
    "purchases" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT,
    "groupId" TEXT,
    "financialDataId" TEXT,
    "year" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ANNUAL',
    "mode" TEXT NOT NULL DEFAULT 'SOLO',
    "finalScore" DOUBLE PRECISION,
    "finalRating" TEXT,
    "liquidityScore" DOUBLE PRECISION,
    "profitabilityScore" DOUBLE PRECISION,
    "leverageScore" DOUBLE PRECISION,
    "activityScore" DOUBLE PRECISION,
    "weightedScore" DOUBLE PRECISION,
    "safFactor" DOUBLE PRECISION,
    "icDependencyRatio" DOUBLE PRECISION,
    "hasCrossGuarantee" BOOLEAN NOT NULL DEFAULT false,
    "ratios" TEXT,
    "consolidatedFinancials" TEXT,
    "optimizerSnapshot" TEXT,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ic_transactions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sellerEntityId" TEXT NOT NULL,
    "buyerEntityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isMatched" BOOLEAN NOT NULL DEFAULT false,
    "eliminationApplied" BOOLEAN NOT NULL DEFAULT false,
    "materialityPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ic_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elimination_logs" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "icTransactionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amountEliminated" DOUBLE PRECISION NOT NULL,
    "ruleApplied" TEXT NOT NULL,
    "materialityPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elimination_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenzilat_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT,
    "groupId" TEXT,
    "analysisId" TEXT,
    "year" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ANNUAL',
    "adjustmentType" TEXT NOT NULL,
    "adjustmentAmount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenzilat_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenzilat_audit_logs" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldChanged" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "tenzilat_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjective_inputs" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kkbCategory" TEXT NOT NULL DEFAULT 'orta',
    "activeDelayDays" INTEGER NOT NULL DEFAULT 0,
    "checkProtest" BOOLEAN NOT NULL DEFAULT false,
    "enforcementFile" BOOLEAN NOT NULL DEFAULT false,
    "creditLimitUtilPct" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "hasMultipleBanks" BOOLEAN NOT NULL DEFAULT false,
    "avgMaturityMonths" INTEGER NOT NULL DEFAULT 6,
    "companyAgeYears" INTEGER NOT NULL DEFAULT 3,
    "auditLevel" TEXT NOT NULL DEFAULT 'ymm',
    "ownershipClarity" BOOLEAN NOT NULL DEFAULT true,
    "hasTaxDebt" BOOLEAN NOT NULL DEFAULT false,
    "hasSgkDebt" BOOLEAN NOT NULL DEFAULT false,
    "activeLawsuitCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjective_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_data_entityId_year_period_key" ON "financial_data"("entityId", "year", "period");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_financialDataId_key" ON "analyses"("financialDataId");

-- CreateIndex
CREATE UNIQUE INDEX "elimination_logs_icTransactionId_key" ON "elimination_logs"("icTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "subjective_inputs_entityId_key" ON "subjective_inputs"("entityId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_data" ADD CONSTRAINT "financial_data_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_financialDataId_fkey" FOREIGN KEY ("financialDataId") REFERENCES "financial_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ic_transactions" ADD CONSTRAINT "ic_transactions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ic_transactions" ADD CONSTRAINT "ic_transactions_sellerEntityId_fkey" FOREIGN KEY ("sellerEntityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ic_transactions" ADD CONSTRAINT "ic_transactions_buyerEntityId_fkey" FOREIGN KEY ("buyerEntityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elimination_logs" ADD CONSTRAINT "elimination_logs_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elimination_logs" ADD CONSTRAINT "elimination_logs_icTransactionId_fkey" FOREIGN KEY ("icTransactionId") REFERENCES "ic_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenzilat_entries" ADD CONSTRAINT "tenzilat_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenzilat_entries" ADD CONSTRAINT "tenzilat_entries_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenzilat_entries" ADD CONSTRAINT "tenzilat_entries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenzilat_entries" ADD CONSTRAINT "tenzilat_entries_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenzilat_audit_logs" ADD CONSTRAINT "tenzilat_audit_logs_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "tenzilat_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenzilat_audit_logs" ADD CONSTRAINT "tenzilat_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjective_inputs" ADD CONSTRAINT "subjective_inputs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
