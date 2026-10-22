-- CreateEnum
CREATE TYPE "TaskReminderType" AS ENUM ('DUE_24_HOURS', 'DUE_1_HOUR');

-- CreateEnum
CREATE TYPE "TaskReminderStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'SKIPPED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DEADLINE_REMINDER';

-- CreateTable
CREATE TABLE "TaskReminder" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "TaskReminderType" NOT NULL,
    "status" "TaskReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notificationAt" TIMESTAMP(3),
    "emailQueuedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskReminder_status_dueDate_idx" ON "TaskReminder"("status", "dueDate");

-- CreateIndex
CREATE INDEX "TaskReminder_recipientId_status_idx" ON "TaskReminder"("recipientId", "status");

-- CreateIndex
CREATE INDEX "TaskReminder_organizationId_idx" ON "TaskReminder"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReminder_taskId_dueDate_recipientId_type_key" ON "TaskReminder"("taskId", "dueDate", "recipientId", "type");

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
