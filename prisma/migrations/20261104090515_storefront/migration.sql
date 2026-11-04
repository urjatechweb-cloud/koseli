-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'DEMO';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "senderContact" TEXT,
ADD COLUMN     "senderName" TEXT,
ALTER COLUMN "deliverOn" SET DATA TYPE DATE;

