-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AmountSource" AS ENUM ('PLAID_SUGGESTED', 'USER_OVERRIDDEN');

-- CreateEnum
CREATE TYPE "PlaidItemStatus" AS ENUM ('ACTIVE', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('PLAID', 'MANUAL');

-- CreateEnum
CREATE TYPE "BudgetImpact" AS ENUM ('VARIABLE', 'FIXED_EXCLUDED', 'TRANSFER_EXCLUDED', 'INCOME_EXCLUDED', 'USER_EXCLUDED');

-- CreateEnum
CREATE TYPE "HiddenReason" AS ENUM ('USER', 'SUPERSEDED', 'PLAID_REMOVED');

-- CreateEnum
CREATE TYPE "StreamDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "StreamFrequency" AS ENUM ('UNKNOWN', 'WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'ANNUALLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetProfile" (
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incomeMonthlyCents" BIGINT NOT NULL,
    "fixedMonthlyCents" BIGINT NOT NULL,
    "sourceIncome" "AmountSource" NOT NULL,
    "sourceFixed" "AmountSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "transactionsCursor" TEXT,
    "status" "PlaidItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidAccount" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mask" TEXT,
    "type" TEXT,
    "subtype" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidRecurringStream" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "plaidStreamId" TEXT NOT NULL,
    "direction" "StreamDirection" NOT NULL,
    "description" TEXT NOT NULL,
    "merchantName" TEXT,
    "frequency" "StreamFrequency" NOT NULL,
    "avgAmountCents" BIGINT NOT NULL,
    "lastAmountCents" BIGINT NOT NULL,
    "predictedNextDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "countsTowardIncome" BOOLEAN NOT NULL,
    "countsTowardFixed" BOOLEAN NOT NULL,
    "userAmountOverrideCents" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidRecurringStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "itemId" TEXT,
    "accountId" TEXT,
    "plaidTransactionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "authorizedDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pending" BOOLEAN NOT NULL,
    "pendingTransactionId" TEXT,
    "isSuperseded" BOOLEAN NOT NULL DEFAULT false,
    "isRemovedByPlaid" BOOLEAN NOT NULL DEFAULT false,
    "budgetImpact" "BudgetImpact" NOT NULL,
    "userOverrideImpact" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" "HiddenReason",
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "categoryPrimary" TEXT,
    "categoryDetailed" TEXT,
    "userNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_refreshTokenHash_key" ON "RefreshSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_plaidItemId_key" ON "PlaidItem"("plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidItem_userId_status_idx" ON "PlaidItem"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidAccount_plaidAccountId_key" ON "PlaidAccount"("plaidAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidRecurringStream_plaidStreamId_key" ON "PlaidRecurringStream"("plaidStreamId");

-- CreateIndex
CREATE INDEX "PlaidRecurringStream_userId_direction_isActive_idx" ON "PlaidRecurringStream"("userId", "direction", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_userId_effectiveDate_idx" ON "Transaction"("userId", "effectiveDate");

-- CreateIndex
CREATE INDEX "Transaction_userId_isHidden_idx" ON "Transaction"("userId", "isHidden");

-- CreateIndex
CREATE INDEX "Transaction_userId_budgetImpact_effectiveDate_idx" ON "Transaction"("userId", "budgetImpact", "effectiveDate");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetProfile" ADD CONSTRAINT "BudgetProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidRecurringStream" ADD CONSTRAINT "PlaidRecurringStream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidRecurringStream" ADD CONSTRAINT "PlaidRecurringStream_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlaidItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

