-- AlterTable
ALTER TABLE "MerchantConfig" ADD COLUMN     "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storeType" TEXT;
