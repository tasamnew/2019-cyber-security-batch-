-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Channel_pinned_idx" ON "Channel"("pinned");
