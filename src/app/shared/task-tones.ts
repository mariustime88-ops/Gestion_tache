import { Task, TaskPriority, TaskStatus } from '../core/models';

/** Couleur du badge (classe `ui-badge--*`) pour chaque statut de tâche. */
export function statusTone(status: TaskStatus): string {
  const tones: Record<TaskStatus, string> = {
    assigned: 'grey',
    in_progress: 'blue',
    submitted: 'amber',
    needs_revision: 'violet',
    paused: 'grey',
    completed: 'green',
    rejected: 'red',
  };

  return tones[status];
}

export function priorityTone(priority: TaskPriority): string {
  const tones: Record<TaskPriority, string> = { low: 'grey', normal: 'blue', high: 'amber', urgent: 'red' };

  return tones[priority] ?? 'grey';
}

export function isOverdue(task: Pick<Task, 'is_overdue'>): boolean {
  return task.is_overdue === true;
}
