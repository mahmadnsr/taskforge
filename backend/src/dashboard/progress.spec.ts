import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@prisma/client';
import { calculateProjectProgress, calculateTaskProgress } from './progress.js';

const task = (id: string, parentId: string | null, status: TaskStatus, completed: boolean[] = []) => ({
  id, parentId, status, checklistItems: completed.map((value) => ({ completed: value })),
});

describe('progress rules', () => {
  it('uses zero for empty active tasks and 100 for DONE tasks', () => {
    expect(calculateTaskProgress(task('a', null, TaskStatus.TODO), []).percent).toBe(0);
    expect(calculateTaskProgress(task('a', null, TaskStatus.DONE), []).percent).toBe(100);
  });

  it('combines checklist and subtask completion equally when both exist', () => {
    const value = calculateTaskProgress(task('a', null, TaskStatus.IN_PROGRESS, [true, true]), [
      task('b', 'a', TaskStatus.DONE), task('c', 'a', TaskStatus.TODO),
    ]);
    expect(value).toMatchObject({ checklistPercent: 100, subtaskPercent: 50, percent: 75, subtasksCompleted: 1 });
  });

  it('averages root tasks only so subtasks are not counted twice', () => {
    const value = calculateProjectProgress([
      task('a', null, TaskStatus.IN_PROGRESS, [true, false]),
      task('b', 'a', TaskStatus.DONE),
      task('c', null, TaskStatus.TODO),
    ]);
    expect(value).toEqual({ taskCount: 2, percent: 38 });
    expect(calculateProjectProgress([])).toEqual({ taskCount: 0, percent: 0 });
  });
});
