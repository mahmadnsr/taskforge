import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { AssignTaskInput } from './assign-task.input.js';

describe('AssignTaskInput', () => {
  it('accepts an explicit null assignee for unassignment', async () => {
    const input = new AssignTaskInput();
    input.organizationId = '11111111-1111-4111-8111-111111111111';
    input.taskId = '22222222-2222-4222-8222-222222222222';
    input.assigneeId = null;

    expect(await validate(input)).toEqual([]);
  });

  it('still rejects a malformed non-null assignee', async () => {
    const input = new AssignTaskInput();
    input.organizationId = '11111111-1111-4111-8111-111111111111';
    input.taskId = '22222222-2222-4222-8222-222222222222';
    input.assigneeId = 'invalid-id';

    expect((await validate(input)).some((error) => error.property === 'assigneeId')).toBe(true);
  });
});
