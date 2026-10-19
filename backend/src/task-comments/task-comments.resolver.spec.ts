import { describe, expect, it, vi } from 'vitest';
import { TaskCommentsResolver } from './task-comments.resolver.js';
import type { TaskCommentsService } from './task-comments.service.js';
import type { CreateTaskCommentInput } from './dto/create-task-comment.input.js';
import type { UpdateTaskCommentInput } from './dto/update-task-comment.input.js';

describe('TaskCommentsResolver', () => {
  const service = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByTask: vi.fn(),
  };

  const resolver = new TaskCommentsResolver(
    service as unknown as TaskCommentsService,
  );

  it('passes the authenticated user ID and input to create', async () => {
    const user = { id: 'user-1' };
    const input = {
      organizationId: 'org-1',
      taskId: 'task-1',
      content: 'Hello',
    } satisfies CreateTaskCommentInput;

    const expected = { id: 'comment-1', content: 'Hello' };
    service.create.mockResolvedValueOnce(expected);

    await expect(resolver.createTaskComment(user, input)).resolves.toBe(
      expected,
    );

    expect(service.create).toHaveBeenCalledWith('user-1', input);
  });

  it('passes the authenticated user ID and requested scope to the query service', async () => {
    const user = { id: 'user-1' };
    const expected = [{ id: 'comment-1', content: 'Hello' }];
    service.findByTask.mockResolvedValueOnce(expected);

    await expect(
      resolver.taskComments(user, 'org-1', 'task-1'),
    ).resolves.toBe(expected);

    expect(service.findByTask).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'task-1',
    );
  });

  it('passes the authenticated user ID and input to update', async () => {
    const user = { id: 'user-1' };
    const input = {
      organizationId: 'org-1',
      taskId: 'task-1',
      commentId: 'comment-1',
      content: 'Updated comment',
    } satisfies UpdateTaskCommentInput;

    const expected = { id: 'comment-1', content: 'Updated comment' };
    service.update.mockResolvedValueOnce(expected);

    await expect(resolver.updateTaskComment(user, input)).resolves.toBe(
      expected,
    );

    expect(service.update).toHaveBeenCalledWith('user-1', input);
  });

  it('passes the authenticated user ID and scope to delete', async () => {
    const user = { id: 'user-1' };
    service.delete.mockResolvedValueOnce(true);

    await expect(
      resolver.deleteTaskComment(user, 'org-1', 'task-1', 'comment-1'),
    ).resolves.toBe(true);

    expect(service.delete).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'task-1',
      'comment-1',
    );
  });

});
