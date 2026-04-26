-- CreateTable
CREATE TABLE "ProductState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantConfig" (
    "shop" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL DEFAULT 'Try It On',
    "buttonColor" TEXT NOT NULL DEFAULT '#000000',
    "buttonPosition" TEXT NOT NULL DEFAULT 'below-add-to-cart',
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "fullWidth" BOOLEAN NOT NULL DEFAULT true,
    "showWatermark" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MerchantConfig_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductState_shop_productId_key" ON "ProductState"("shop", "productId");
