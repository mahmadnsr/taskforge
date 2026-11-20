-- Run only against the dedicated local staging database. All fixtures roll back.
BEGIN;

DO $verify$
DECLARE
  suffix text := replace(gen_random_uuid()::text, '-', '');
  actor_id text := gen_random_uuid()::text;
  org_a text := gen_random_uuid()::text;
  org_b text := gen_random_uuid()::text;
  project_a text := gen_random_uuid()::text;
  project_b text := gen_random_uuid()::text;
  project_c text := gen_random_uuid()::text;
  root_id text := gen_random_uuid()::text;
  child_id text := gen_random_uuid()::text;
  rejected_by text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Task_parentId_organizationId_projectId_fkey'
      AND conrelid = '"Task"'::regclass
      AND confdeltype = 'r'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TaskActivity_taskId_organizationId_fkey'
      AND conrelid = '"TaskActivity"'::regclass
      AND confdeltype = 'r'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TaskChecklistItem_taskId_organizationId_fkey'
      AND conrelid = '"TaskChecklistItem"'::regclass
      AND confdeltype = 'c'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'Task_check_nesting_depth'
      AND tgrelid = '"Task"'::regclass AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'TaskActivity'
      AND indexname = 'TaskActivity_taskId_createdAt_id_idx'
  ) THEN
    RAISE EXCEPTION 'Required task constraints, trigger, or index missing';
  END IF;

  INSERT INTO "User" (id, name, email, "passwordHash", "updatedAt")
    VALUES (actor_id, 'Staging constraint fixture', suffix || '@example.test', 'staging-only', now());
  INSERT INTO "Organization" (id, name, slug, "updatedAt")
    VALUES (org_a, 'Staging A', suffix || '-a', now()),
           (org_b, 'Staging B', suffix || '-b', now());
  INSERT INTO "OrganizationMember" (id, "userId", "organizationId", role)
    VALUES (gen_random_uuid()::text, actor_id, org_a, 'ADMIN'),
           (gen_random_uuid()::text, actor_id, org_b, 'ADMIN');
  INSERT INTO "Project" (id, "organizationId", name, "createdById", "updatedAt")
    VALUES (project_a, org_a, 'Staging A1', actor_id, now()),
           (project_b, org_a, 'Staging A2', actor_id, now()),
           (project_c, org_b, 'Staging B1', actor_id, now());
  INSERT INTO "Task" (id, "organizationId", "projectId", title, "createdById", "updatedAt")
    VALUES (root_id, org_a, project_a, 'Fixture root', actor_id, now());
  INSERT INTO "Task" (id, "organizationId", "projectId", title, "createdById", "parentId", "updatedAt")
    VALUES (child_id, org_a, project_a, 'Fixture child', actor_id, root_id, now());

  BEGIN
    INSERT INTO "Task" (id, "organizationId", "projectId", title, "createdById", "parentId", "updatedAt")
      VALUES (gen_random_uuid()::text, org_a, project_b, 'Wrong project', actor_id, root_id, now());
    RAISE EXCEPTION 'Cross-project subtask was accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "Task" (id, "organizationId", "projectId", title, "createdById", "parentId", "updatedAt")
      VALUES (gen_random_uuid()::text, org_b, project_c, 'Wrong organization', actor_id, root_id, now());
    RAISE EXCEPTION 'Cross-organization subtask was accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "Task" (id, "organizationId", "projectId", title, "createdById", "parentId", "updatedAt")
      VALUES (gen_random_uuid()::text, org_a, project_a, 'Grandchild', actor_id, child_id, now());
    RAISE EXCEPTION 'Third-level task was accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;

  INSERT INTO "TaskActivity" (id, "taskId", "organizationId", "actorId", type)
    VALUES (gen_random_uuid()::text, child_id, org_a, actor_id, 'STAGING_FIXTURE');
  UPDATE "Task" SET "deletedAt" = now() WHERE id IN (root_id, child_id);
  IF (SELECT count(*) FROM "TaskActivity" WHERE "taskId" = child_id) <> 1 THEN
    RAISE EXCEPTION 'Soft delete lost activity';
  END IF;

  BEGIN
    DELETE FROM "Task" WHERE id = child_id;
    RAISE EXCEPTION 'Hard delete lost activity protection';
  EXCEPTION WHEN restrict_violation THEN
    GET STACKED DIAGNOSTICS rejected_by = CONSTRAINT_NAME;
    IF rejected_by IS DISTINCT FROM 'TaskActivity_taskId_organizationId_fkey' THEN
      RAISE EXCEPTION 'Hard delete was blocked by an unexpected constraint: %', rejected_by;
    END IF;
  END;
END
$verify$;

ROLLBACK;
