-- AlterTable: Google auth + optional password
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT 'local';

CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- DailyOverride split hours (if table exists from earlier schema)
ALTER TABLE "DailyOverride" ADD COLUMN IF NOT EXISTS "regularHours" DOUBLE PRECISION;
ALTER TABLE "DailyOverride" ADD COLUMN IF NOT EXISTS "overtimeHours" DOUBLE PRECISION;
