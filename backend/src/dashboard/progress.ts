import { TaskStatus } from '@prisma/client';

export type ProgressTaskRow = {
  id: string;
  parentId: string | null;
  status: TaskStatus;
  checklistItems: { completed: boolean }[];
};

export type TaskProgressValue = {
  taskId: string;
  checklistCompleted: number;
  checklistTotal: number;
  checklistPercent: number;
  subtasksCompleted: number;
  subtasksTotal: number;
  subtaskPercent: number;
  percent: number;
};

const percentage = (completed: number, total: number) =>
  total === 0 ? 0 : Math.round((completed / total) * 100);

export function calculateTaskProgress(
  task: ProgressTaskRow,
  subtasks: Pick<ProgressTaskRow, 'status'>[],
): TaskProgressValue {
  const checklistTotal = task.checklistItems.length;
  const checklistCompleted = task.checklistItems.filter((item) => item.completed).length;
  const subtasksTotal = subtasks.length;
  const subtasksCompleted = subtasks.filter((child) => child.status === TaskStatus.DONE).length;
  const checklistPercent = percentage(checklistCompleted, checklistTotal);
  const subtaskPercent = percentage(subtasksCompleted, subtasksTotal);
  const parts = [
    ...(checklistTotal ? [checklistPercent] : []),
    ...(subtasksTotal ? [subtaskPercent] : []),
  ];

  return {
    taskId: task.id,
    checklistCompleted,
    checklistTotal,
    checklistPercent,
    subtasksCompleted,
    subtasksTotal,
    subtaskPercent,
    percent: task.status === TaskStatus.DONE
      ? 100
      : parts.length ? Math.round(parts.reduce((sum, part) => sum + part, 0) / parts.length) : 0,
  };
}

export function calculateProjectProgress(tasks: ProgressTaskRow[]) {
  const children = new Map<string, ProgressTaskRow[]>();
  for (const task of tasks) {
    if (task.parentId) {
      const group = children.get(task.parentId) ?? [];
      group.push(task);
      children.set(task.parentId, group);
    }
  }
  const roots = tasks.filter((task) => !task.parentId);
  return {
    taskCount: roots.length,
    percent: roots.length
      ? Math.round(roots.reduce((sum, root) => sum + calculateTaskProgress(root, children.get(root.id) ?? []).percent, 0) / roots.length)
      : 0,
  };
}
