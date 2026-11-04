-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Currency" ADD VALUE 'CAD';
ALTER TYPE "Currency" ADD VALUE 'JPY';
ALTER TYPE "Currency" ADD VALUE 'KRW';
ALTER TYPE "Currency" ADD VALUE 'AED';
ALTER TYPE "Currency" ADD VALUE 'QAR';
ALTER TYPE "Currency" ADD VALUE 'SAR';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "fxQuoteId" TEXT;

-- CreateTable
CREATE TABLE "FxQuote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "nprMinor" INTEGER NOT NULL,
    "foreignMinor" INTEGER NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "bufferBps" INTEGER NOT NULL,
    "rateSource" TEXT NOT NULL,
    "rateFetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FxQuote_orderId_createdAt_idx" ON "FxQuote"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerTxnId_key" ON "Payment"("provider", "providerTxnId");

-- AddForeignKey
ALTER TABLE "FxQuote" ADD CONSTRAINT "FxQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fxQuoteId_fkey" FOREIGN KEY ("fxQuoteId") REFERENCES "FxQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

