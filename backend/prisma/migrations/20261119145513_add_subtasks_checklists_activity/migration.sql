-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskChecklistItem_taskId_position_idx" ON "TaskChecklistItem"("taskId", "position");

-- CreateIndex
CREATE INDEX "TaskChecklistItem_organizationId_idx" ON "TaskChecklistItem"("organizationId");

-- CreateIndex
CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskActivity_organizationId_idx" ON "TaskActivity"("organizationId");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_organizationId_fkey" FOREIGN KEY ("parentId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
