import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditLogEntry } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';
import { Icon } from '../../shared/icon';

const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Toutes les actions' },
  { value: 'task.', label: 'Tâches' },
  { value: 'user.', label: 'Comptes' },
];

@Component({
  selector: 'app-audit-page',
  imports: [DatePipe, FormsModule, Icon],
  templateUrl: './audit-page.html',
  styleUrl: './audit-page.scss',
})
export class AuditPage {
  private readonly workspace = inject(WorkspaceService);

  readonly actionFilters = ACTION_FILTERS;
  readonly entries = signal<AuditLogEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly expanded = signal<number | null>(null);

  search = '';
  action = '';

  constructor() {
    this.load();
  }

  load(page = 1): void {
    this.loading.set(true);
    this.error.set('');
    this.workspace.auditLogs(page, this.search, this.action).subscribe({
      next: (response) => {
        this.entries.set(response.data);
        this.page.set(response.current_page);
        this.lastPage.set(response.last_page);
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(
          error instanceof HttpErrorResponse && error.status === 403
            ? 'Le journal d’audit est réservé à l’administration et à la direction générale.'
            : 'Le journal d’audit n’a pas pu être chargé.',
        );
        this.loading.set(false);
      },
    });
  }

  toggle(id: number): void {
    this.expanded.update((current) => (current === id ? null : id));
  }

  actionLabel(action: string): string {
    const labels: Record<string, string> = {
      'task.created': 'Tâche créée',
      'task.updated': 'Tâche modifiée',
      'task.status_changed': 'Changement de statut',
      'task.deleted': 'Tâche supprimée',
      'user.created': 'Compte créé',
      'user.updated': 'Compte modifié',
      'user.deactivated': 'Compte désactivé',
      'user.restored': 'Compte réactivé',
    };

    return labels[action] ?? action;
  }

  actionTone(action: string): string {
    if (action.endsWith('deleted') || action.endsWith('deactivated')) {
      return 'red';
    }
    if (action.endsWith('created') || action.endsWith('restored')) {
      return 'green';
    }

    return 'blue';
  }

  changeRows(entry: AuditLogEntry): { field: string; old: string; new: string }[] {
    return Object.entries(entry.changes ?? {}).map(([field, value]) => ({
      field,
      old: this.format(value.old),
      new: this.format(value.new),
    }));
  }

  private format(value: unknown): string {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }
}
