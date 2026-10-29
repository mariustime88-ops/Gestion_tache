import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, finalize, Subject } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { Task, TaskPriority, TaskStatus, User } from '../../core/models';
import { roleLabels, taskPriorityLabels, taskStatusLabels, WorkspaceService } from '../../core/workspace.service';
import { Icon } from '../../shared/icon';
import { priorityTone, statusTone } from '../../shared/task-tones';

function dueDateValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value) {
    return { required: true };
  }

  const selectedDate = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (selectedDate < today) {
    return { pastDate: true };
  }

  return null;
}

@Component({
  selector: 'app-tasks-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.scss',
})
export class TasksPage implements OnInit {
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchChanges = new Subject<void>();

  readonly user = this.auth.user;
  readonly capabilityRole = computed(() => this.user()?.capability_role ?? this.user()?.role ?? '');
  readonly canCreateTask = computed(() => {
    const user = this.user();
    if (!user) {
      return false;
    }

    if (user.role === 'admin') {
      return true;
    }

    const isCustomSupervisor = this.workspace.organizationRoles()
      .some((role) => role.slug === user.role && !role.is_system);
    const roleCanCreate = ['dg', 'manager', 'division_manager'].includes(this.capabilityRole())
      || isCustomSupervisor;
    const hasPermission = Array.isArray(user.allowed_pages)
      ? user.allowed_pages.includes('create_tasks')
      : roleCanCreate;

    return roleCanCreate && hasPermission;
  });
  readonly tasks = signal<Task[]>([]);
  readonly agents = signal<Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[]>([]);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formOpen = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly search = signal('');
  readonly statusFilter = signal<TaskStatus | 'all'>('all');
  readonly priorityFilter = signal<TaskPriority | 'all'>('all');
  readonly overdueOnly = signal(false);
  readonly exporting = signal(false);
  readonly priorityLabels = taskPriorityLabels;
  readonly priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;
  readonly error = signal('');
  readonly success = signal('');
  readonly roleLabels = roleLabels;
  readonly statusLabels = taskStatusLabels;
  readonly filteredAgents = computed(() => {
    const currentUser = this.user();
    const allAgents = this.agents();

    if (!currentUser) {
      return allAgents;
    }

    const role = currentUser.capability_role ?? currentUser.role;
    if (role === 'dg' || role === 'admin') {
      return allAgents;
    }

    return allAgents.filter((agent) => {
      if (role === 'division_manager' || (role === 'agent' && currentUser.role !== role)) {
        return agent.department === currentUser.department && agent.division === currentUser.division;
      }

      return agent.department === currentUser.department;
    });
  });
  readonly scopedTasks = computed(() => {
    const currentUser = this.user();
    const allTasks = this.tasks();

    if (!currentUser) {
      return allTasks;
    }

    const role = currentUser.capability_role ?? currentUser.role;
    switch (role) {
      case 'admin':
      case 'dg':
        return allTasks;
      case 'agent':
        return currentUser.role !== role
          ? allTasks.filter((task) => task.department === currentUser.department && task.division === currentUser.division)
          : allTasks.filter((task) => task.assigned_to === currentUser.id);
      case 'division_manager':
        return allTasks.filter(
          (task) => task.department === currentUser.department
            && (task.division === currentUser.division || task.status === 'paused'),
        );
      case 'manager':
        return allTasks.filter((task) => task.department === currentUser.department);
      default:
        return [];
    }
  });
  readonly statusLabel = (task: Task): string =>
    task.status === 'assigned' && task.created_by === this.user()?.id
      ? 'Envoyée'
      : this.statusLabels[task.status];
  readonly visibleTasks = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('fr');
    const status = this.statusFilter();

    return this.scopedTasks().filter((task) => {
      const matchesSearch = !search
        || task.title.toLocaleLowerCase('fr').includes(search)
        || task.description.toLocaleLowerCase('fr').includes(search)
        || task.assignee?.name.toLocaleLowerCase('fr').includes(search);

      return matchesSearch && (status === 'all' || task.status === status);
    });
  });
  readonly displayTotal = computed(() => this.total());

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(180)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    instructions: [''],
    due_at: ['', [Validators.required, dueDateValidator]],
    assigned_to: [0, [Validators.required, Validators.min(1)]],
    priority: ['normal' as TaskPriority, [Validators.required]],
  });

  constructor() {
    this.searchChanges.pipe(
      debounceTime(250),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.loadTasks());
  }

  ngOnInit(): void {
    this.loadTasks();
    if (this.canCreateTask()) {
      this.workspace.agents().subscribe({
        next: (response) => this.agents.set(response.data),
        error: (error: unknown) => this.error.set(this.readError(error, 'La liste des agents n’a pas pu être chargée.')),
      });
    }
  }

  loadTasks(): void {
    this.loading.set(true);
    this.error.set('');
    const status = this.statusFilter();
    this.workspace.tasks(status === 'all' ? undefined : status, this.page(), this.search(), this.currentFilters())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.tasks.set(response.data);
          this.page.set(response.current_page);
          this.lastPage.set(response.last_page);
          this.total.set(response.total);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'Les tâches n’ont pas pu être chargées.')),
      });
  }

  private currentFilters(): { priority?: TaskPriority; overdue?: boolean } {
    const priority = this.priorityFilter();

    return {
      priority: priority === 'all' ? undefined : priority,
      overdue: this.overdueOnly() || undefined,
    };
  }

  changePriority(event: Event): void {
    this.priorityFilter.set((event.target as HTMLSelectElement).value as TaskPriority | 'all');
    this.page.set(1);
    this.loadTasks();
  }

  toggleOverdue(): void {
    this.overdueOnly.update((value) => !value);
    this.page.set(1);
    this.loadTasks();
  }

  /** Télécharge un fichier CSV (ouvrable dans Excel) des tâches correspondant aux filtres. */
  exportTasks(): void {
    const status = this.statusFilter();
    this.exporting.set(true);
    this.workspace.exportTasks(status === 'all' ? undefined : status, this.search(), this.currentFilters())
      .pipe(finalize(() => this.exporting.set(false)))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `taches-${new Date().toISOString().slice(0, 10)}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'L’export n’a pas pu être généré.')),
      });
  }

  changeStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.statusFilter.set(value as TaskStatus | 'all');
    this.page.set(1);
    this.loadTasks();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.lastPage()) {
      return;
    }
    this.page.set(page);
    this.loadTasks();
  }

  changeSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
    this.searchChanges.next();
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedFile.set(file);
  }

  createTask(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.success.set('');
    this.saving.set(true);
    const value = this.form.getRawValue();

    this.workspace.createTask({
      ...value,
      due_at: value.due_at || null,
      assigned_to: Number(value.assigned_to),
    })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: ({ data }) => {
          const file = this.selectedFile();
          if (!file) {
            void this.router.navigate(['/tasks', data.task.id]);
            return;
          }

          this.workspace.addActivity(data.task.id, 'Document transmis avec la tâche.', file).subscribe({
            next: () => void this.router.navigate(['/tasks', data.task.id]),
            error: (error: unknown) => {
              this.error.set(`La tâche est créée, mais le fichier n’a pas été envoyé : ${this.readError(error, 'réessayez depuis la page de la tâche.')}`);
              this.formOpen.set(false);
              this.loadTasks();
            },
          });
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'La tâche n’a pas pu être créée.')),
      });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }
}
