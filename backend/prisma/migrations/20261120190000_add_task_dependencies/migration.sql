CREATE TABLE "TaskDependency" (
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "blockingTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId", "blockingTaskId"),
    CONSTRAINT "TaskDependency_no_self_dependency" CHECK ("taskId" <> "blockingTaskId")
);

CREATE INDEX "TaskDependency_organizationId_projectId_blockingTaskId_idx"
    ON "TaskDependency"("organizationId", "projectId", "blockingTaskId");

ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_organizationId_projectId_fkey"
    FOREIGN KEY ("taskId", "organizationId", "projectId")
    REFERENCES "Task"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockingTaskId_organizationId_projectId_fkey"
    FOREIGN KEY ("blockingTaskId", "organizationId", "projectId")
    REFERENCES "Task"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
