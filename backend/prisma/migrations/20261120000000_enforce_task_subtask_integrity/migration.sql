-- The preceding migration may already be recorded in some environments.
-- Keep this correction separate so its history is never rewritten.
BEGIN;

-- Fail safely if writes made between the two migrations already violated
-- the invariants. No existing task or activity is changed by this check.
LOCK TABLE "Task" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Task" child JOIN "Task" parent
      ON parent."id" = child."parentId"
    WHERE child."parentId" IS NOT NULL
      AND (child."organizationId" <> parent."organizationId"
        OR child."projectId" <> parent."projectId"
        OR parent."parentId" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Existing task hierarchy violates organization, project, or depth integrity';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "Task_id_organizationId_projectId_key"
  ON "Task"("id", "organizationId", "projectId");

ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Task" DROP CONSTRAINT "Task_parentId_organizationId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_organizationId_projectId_fkey"
  FOREIGN KEY ("parentId", "organizationId", "projectId")
  REFERENCES "Task"("id", "organizationId", "projectId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Activity is retained with its task tombstone; reject accidental hard deletes.
ALTER TABLE "TaskActivity" DROP CONSTRAINT "TaskActivity_taskId_organizationId_fkey";
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_organizationId_fkey"
  FOREIGN KEY ("taskId", "organizationId")
  REFERENCES "Task"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A foreign key cannot enforce depth. Lock the parent row so concurrent
-- child creation and reparenting cannot each pass a stale depth check.
CREATE FUNCTION "check_task_nesting_depth"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL THEN
    IF NEW."parentId" = NEW."id" THEN
      RAISE EXCEPTION 'A task cannot be its own parent' USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM "Task"
      WHERE "id" = NEW."parentId"
        AND "organizationId" = NEW."organizationId"
        AND "projectId" = NEW."projectId"
        AND "deletedAt" IS NULL
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent task is unavailable' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "Task"
      WHERE "id" = NEW."parentId" AND "parentId" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A subtask cannot have children' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."parentId" IS DISTINCT FROM OLD."parentId"
      AND NEW."parentId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "Task"
        WHERE "parentId" = NEW."id" AND "organizationId" = NEW."organizationId"
      )
    THEN
      RAISE EXCEPTION 'A task with children cannot become a subtask' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Task_check_nesting_depth"
BEFORE INSERT OR UPDATE OF "parentId", "organizationId", "projectId"
ON "Task" FOR EACH ROW EXECUTE FUNCTION "check_task_nesting_depth"();

DROP INDEX "TaskActivity_taskId_createdAt_idx";
CREATE INDEX "TaskActivity_taskId_createdAt_id_idx"
  ON "TaskActivity"("taskId", "createdAt" DESC, "id" DESC);

COMMIT;
