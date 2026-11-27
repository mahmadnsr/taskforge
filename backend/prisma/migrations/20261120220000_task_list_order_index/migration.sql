CREATE INDEX "Task_live_project_createdAt_id_idx"
    ON "Task"("organizationId", "projectId", "deletedAt", "createdAt" DESC, "id" ASC);
