-- Existing negotiated tariffs belong to credit. Debit rates require explicit configuration.
ALTER TABLE "ZoneTariff" ADD COLUMN "productType" "CardProductType" NOT NULL DEFAULT 'CREDITO';
DROP INDEX "ZoneTariff_zona_key";
CREATE UNIQUE INDEX "ZoneTariff_productType_zona_key" ON "ZoneTariff"("productType", "zona");
