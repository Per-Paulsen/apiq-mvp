-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "specVersionId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "affectedEndpoints" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narration" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "patchSummary" TEXT NOT NULL,
    "patchOps" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "appliedAt" TIMESTAMP(3),
    "appliedInVersionId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "specId" TEXT,
    "specVersionId" TEXT,
    "model" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "responseRaw" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costUSD" DOUBLE PRECISION NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Finding_specId_status_idx" ON "Finding"("specId", "status");

-- CreateIndex
CREATE INDEX "LLMCall_workspaceId_createdAt_idx" ON "LLMCall"("workspaceId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_specId_fkey" FOREIGN KEY ("specId") REFERENCES "Spec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_specVersionId_fkey" FOREIGN KEY ("specVersionId") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
