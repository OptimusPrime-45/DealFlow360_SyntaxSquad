-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "portal_last_login_at" TIMESTAMP(3),
ADD COLUMN     "portal_password_hash" TEXT;
