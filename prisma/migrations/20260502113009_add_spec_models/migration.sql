-- CreateTable
CREATE TABLE "Spec" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceFormat" TEXT NOT NULL,
    "wasAuthedPull" BOOLEAN NOT NULL DEFAULT false,
    "originalJson" JSONB NOT NULL,
    "currentJson" JSONB NOT NULL,
    "currentVersionId" TEXT,
    "endpointCount" INTEGER NOT NULL,
    "qualityScore" INTEGER,
    "lastAnalyzedAt" TIMESTAMP(3),
    "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
    "analysisError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecVersion" (
    "id" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "json" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceActionLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Spec_currentVersionId_key" ON "Spec"("currentVersionId");

-- CreateIndex
CREATE INDEX "Spec_workspaceId_idx" ON "Spec"("workspaceId");

-- CreateIndex
CREATE INDEX "SpecVersion_specId_versionNumber_idx" ON "SpecVersion"("specId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SpecVersion_specId_versionNumber_key" ON "SpecVersion"("specId", "versionNumber");

-- CreateIndex
CREATE INDEX "WorkspaceActionLog_workspaceId_action_createdAt_idx" ON "WorkspaceActionLog"("workspaceId", "action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Spec" ADD CONSTRAINT "Spec_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "SpecVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecVersion" ADD CONSTRAINT "SpecVersion_specId_fkey" FOREIGN KEY ("specId") REFERENCES "Spec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
