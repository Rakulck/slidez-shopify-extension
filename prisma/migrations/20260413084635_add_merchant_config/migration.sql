-- CreateTable
CREATE TABLE "ProductState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "MerchantConfig" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "buttonText" TEXT NOT NULL DEFAULT 'Try It On',
    "buttonColor" TEXT NOT NULL DEFAULT '#000000',
    "buttonPosition" TEXT NOT NULL DEFAULT 'below-add-to-cart',
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "fullWidth" BOOLEAN NOT NULL DEFAULT true,
    "showWatermark" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductState_shop_productId_key" ON "ProductState"("shop", "productId");
