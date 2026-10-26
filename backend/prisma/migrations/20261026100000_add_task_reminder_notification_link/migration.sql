-- Add an optional link from a notification to its task reminder.
ALTER TABLE "Notification"
ADD COLUMN "taskReminderId" TEXT;

-- A reminder can be associated with at most one notification.
CREATE UNIQUE INDEX "Notification_taskReminderId_key"
ON "Notification"("taskReminderId");

-- Preserve notifications if their task reminder is deleted.
ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_taskReminderId_fkey"
FOREIGN KEY ("taskReminderId")
REFERENCES "TaskReminder"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
