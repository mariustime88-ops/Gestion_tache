import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DashboardStats, Task, TaskPriority, TaskStatus } from '../../core/models';
import { taskPriorityLabels, taskStatusLabels, WorkspaceService } from '../../core/workspace.service';
import { Icon } from '../../shared/icon';
import { priorityTone, statusTone } from '../../shared/task-tones';

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly stats = signal<DashboardStats | null>(null);
  readonly tasks = signal<Task[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly statusLabels = taskStatusLabels;
  readonly statusOrder: TaskStatus[] = [
    'assigned',
    'in_progress',
    'submitted',
    'needs_revision',
    'paused',
    'completed',
    'rejected',
  ];
  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;
  readonly priorityLabels = taskPriorityLabels;
  readonly priorityOrder: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];
  readonly statusMetrics = computed(() => {
    const total = Math.max(this.stats()?.tasks_total ?? 0, 1);

    return this.statusOrder.map((status) => {
      const count = this.stats()?.tasks_by_status[status] ?? 0;
      return { status, label: this.statusLabels[status], count, share: Math.round((count / total) * 100) };
    });
  });
  readonly priorityMetrics = computed(() => {
    const byPriority = this.stats()?.tasks_by_priority ?? {};
    const open = Math.max(Object.values(byPriority).reduce((sum, value) => sum + (value ?? 0), 0), 1);

    return this.priorityOrder.map((priority) => {
      const count = byPriority[priority] ?? 0;
      return { priority, label: this.priorityLabels[priority], count, share: Math.round((count / open) * 100) };
    });
  });
  readonly statusLabel = (task: Task): string =>
    task.status === 'assigned' && task.created_by === this.user()?.id
      ? 'Envoyée'
      : this.statusLabels[task.status];
  readonly pendingReviewCount = computed(() =>
    this.stats()?.tasks_pending_review ?? this.stats()?.tasks_by_status.submitted ?? 0,
  );

  ngOnInit(): void {
    this.error.set('');
    this.workspace.dashboard().subscribe({
      next: (response) => this.stats.set(response.data),
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'Le tableau de bord est momentanément indisponible.'));
        this.loading.set(false);
      },
    });

    if (this.user()?.role === 'admin') {
      this.loading.set(false);
      return;
    }

    this.workspace.tasks().subscribe({
      next: (response) => {
        this.tasks.set(response.data.slice(0, 5));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'Les tâches n’ont pas pu être chargées.'));
        this.loading.set(false);
      },
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }
}
