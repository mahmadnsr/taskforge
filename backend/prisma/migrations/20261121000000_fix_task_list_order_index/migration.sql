DROP INDEX "Task_live_project_createdAt_id_idx";

CREATE INDEX "Task_live_project_createdAt_id_idx"
    ON "Task"("organizationId", "projectId", "createdAt" DESC, "id" ASC, "deletedAt" ASC);
