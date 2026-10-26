-- AlterEnum
ALTER TYPE "TaskReminderStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "TaskReminder" ADD COLUMN     "emailProcessingAt" TIMESTAMP(3);
