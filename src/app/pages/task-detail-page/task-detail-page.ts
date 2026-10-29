import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Observable, of, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiTaskResponse, Task, TaskActivity, TaskPriority, User } from '../../core/models';
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
  selector: 'app-task-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './task-detail-page.html',
  styleUrl: './task-detail-page.scss',
  host: {
    '(document:keydown.escape)': 'handleEscape()',
  },
})
export class TaskDetailPage implements OnInit, OnDestroy {
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly sanitizer = inject(DomSanitizer);
  private previewObjectUrl: string | null = null;
  private previewRequest: Subscription | null = null;

  readonly user = this.auth.user;
  readonly task = signal<Task | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly editing = signal(false);
  readonly deleteConfirmationTask = signal<Task | null>(null);
  readonly reassigning = signal(false);
  readonly error = signal('');
  readonly info = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly editSelectedFile = signal<File | null>(null);
  readonly attachmentPreview = signal<{ name: string; url: string; safeUrl: SafeResourceUrl; isImage: boolean } | null>(null);
  readonly previewLoadingId = signal<number | null>(null);
  readonly roleLabels = roleLabels;
  readonly capabilityRole = computed(() => this.user()?.capability_role ?? this.user()?.role ?? '');
  readonly reassignmentAgents = signal<Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[]>([]);
  readonly selectedReassignmentAgentId = signal<number | null>(null);
  readonly agents = signal<Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[]>([]);
  readonly assignableAgents = computed(() => {
    const task = this.task();
    if (!task) {
      return [];
    }

    return this.agents().filter((agent) =>
      agent.department === task.department
      && (this.capabilityRole() !== 'division_manager' || agent.division === task.division)
      && (this.capabilityRole() !== 'agent' || this.user()?.role === this.capabilityRole()
        || agent.division === this.user()?.division),
    );
  });
  readonly statusLabels = taskStatusLabels;
  readonly priorityLabels = taskPriorityLabels;
  readonly priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;
  readonly extensionOpen = signal(false);
  readonly extensionForm = this.fb.group({
    requested_due_at: ['', [Validators.required]],
    reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]],
  });
  readonly extensionDecisionComment = signal('');
  /** Le destinataire peut demander un report tant que la tâche n’est pas livrée. */
  readonly canRequestExtension = computed(() => {
    const task = this.task();

    return !!task
      && task.assigned_to === this.user()?.id
      && ['assigned', 'in_progress', 'needs_revision'].includes(task.status)
      && task.extension_status !== 'pending';
  });
  /** Seul le donneur d’ordre décide d’une demande de report. */
  readonly canDecideExtension = computed(() => {
    const task = this.task();

    return !!task && task.extension_status === 'pending' && task.created_by === this.user()?.id;
  });
  readonly canReview = computed(() => {
    const currentUser = this.user();
    const task = this.task();

    return !!currentUser
      && !!task
      && task.status === 'submitted'
      && (task.created_by === currentUser.id
        || this.capabilityRole() === 'dg'
        || (['manager', 'division_manager'].includes(this.capabilityRole())
          && (currentUser.role !== this.capabilityRole()
            ? task.department === currentUser.department
              && (this.capabilityRole() !== 'division_manager' || task.division === currentUser.division)
            : task.created_by === currentUser.id))
        || (currentUser.role !== this.capabilityRole()
          && this.capabilityRole() === 'agent'
          && task.department === currentUser.department
          && task.division === currentUser.division));
  });
  readonly canStartTask = computed(() => {
    const task = this.task();

    return !!task
      && task.assigned_to === this.user()?.id
      && (['assigned', 'needs_revision'].includes(task.status)
        || (task.status === 'rejected' && task.rejected_by === null));
  });
  readonly canSubmitTask = computed(() => {
    const task = this.task();

    return !!task && task.assigned_to === this.user()?.id && task.status === 'in_progress';
  });
  readonly canEditTask = computed(() => {
    const currentUser = this.user();
    const task = this.task();

    return !!currentUser
      && !!task
      && (this.capabilityRole() === 'admin'
        || task.created_by === currentUser.id
        || ((['manager', 'division_manager'].includes(this.capabilityRole()) || currentUser.role !== this.capabilityRole())
          && task.department === currentUser.department
          && (this.capabilityRole() !== 'division_manager' || task.division === currentUser.division)
          && (this.capabilityRole() !== 'agent' || task.division === currentUser.division)));
  });
  readonly canReassignTask = computed(() => {
    const currentUser = this.user();
    const task = this.task();

    return !!currentUser
      && !!task
      && task.status === 'paused'
      && (['dg', 'manager', 'division_manager'].includes(this.capabilityRole())
        || currentUser.role !== this.capabilityRole());
  });
  readonly canSendUpdate = computed(() => {
    const currentUser = this.user();
    const task = this.task();

    return !!currentUser && !!task
      && (task.assigned_to === currentUser.id || task.created_by === currentUser.id)
      && !['completed', 'rejected'].includes(task.status);
  });
  readonly conversationHeading = computed(() =>
    this.task()?.assigned_to === this.user()?.id ? 'Échanger avec le demandeur' : 'Échanger avec le responsable',
  );

  readonly updateForm = this.fb.group({ body: [''] });
  readonly decisionForm = this.fb.group({ comment: [''] });
  readonly editForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(180)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    instructions: [''],
    due_at: ['', [Validators.required, dueDateValidator]],
    assigned_to: [0, [Validators.required, Validators.min(1)]],
    priority: ['normal' as TaskPriority, [Validators.required]],
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isInteger(id) || id < 1) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      this.loadTask(id);
    });
  }

  ngOnDestroy(): void {
    this.previewRequest?.unsubscribe();
    this.releasePreviewUrl();
  }

  onFileSelected(event: Event): void {
    this.selectedFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  sendUpdate(): void {
    const task = this.task();
    if (!task) {
      return;
    }

    const body = this.updateForm.controls.body.value.trim();
    const file = this.selectedFile();
    if (!body && !file) {
      this.error.set('Ajoutez un message ou un fichier avant l’envoi.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.workspace.addActivity(task.id, body, file ?? undefined)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.updateForm.reset();
          this.selectedFile.set(null);
          this.info.set('Votre message a bien été envoyé.');
          this.loadTask(task.id);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'Le message n’a pas pu être envoyé.')),
      });
  }

  submitTask(): void {
    const task = this.task();
    if (!task) {
      return;
    }

    this.runTaskAction(
      this.workspace.submitTask(task.id),
      'La tâche a été envoyée à son responsable pour validation.',
    );
  }

  startTask(): void {
    const task = this.task();
    if (!task) {
      return;
    }

    this.runTaskAction(
      this.workspace.startTask(task.id),
      'La tâche a démarré et son responsable a été informé.',
    );
  }

  submitExtensionRequest(): void {
    const task = this.task();
    if (!task) {
      return;
    }
    if (this.extensionForm.invalid) {
      this.extensionForm.markAllAsTouched();
      return;
    }

    const { requested_due_at, reason } = this.extensionForm.getRawValue();
    this.runTaskAction(
      this.workspace.requestExtension(task.id, { requested_due_at: new Date(requested_due_at).toISOString(), reason: reason.trim() }),
      'Votre demande de report a été transmise au donneur d’ordre.',
    );
    this.extensionOpen.set(false);
    this.extensionForm.reset();
  }

  decideExtension(decision: 'approved' | 'rejected'): void {
    const task = this.task();
    if (!task) {
      return;
    }

    const comment = this.extensionDecisionComment().trim();
    if (decision === 'rejected' && !comment) {
      this.error.set('Indiquez le motif du refus du report.');
      return;
    }

    this.runTaskAction(
      this.workspace.decideExtension(task.id, decision, comment),
      decision === 'approved' ? 'Le report a été accordé.' : 'Le report a été refusé.',
    );
    this.extensionDecisionComment.set('');
  }

  reviewTask(decision: 'accepted' | 'revision' | 'rejected'): void {
    const task = this.task();
    if (!task) {
      return;
    }

    const comment = this.decisionForm.controls.comment.value.trim();
    if (decision !== 'accepted' && !comment) {
      this.error.set('Ajoutez un commentaire pour expliquer votre décision.');
      return;
    }

    const message = decision === 'accepted'
      ? 'La tâche est validée.'
      : decision === 'revision'
        ? 'La tâche a été renvoyée pour modification.'
        : 'La tâche a été refusée.';

    this.runTaskAction(this.workspace.reviewTask(task.id, decision, comment), message);
  }

  beginEdit(task: Task): void {
    this.error.set('');
    this.busy.set(true);
    this.workspace.agents()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.agents.set(data);
          this.editForm.setValue({
            title: task.title,
            description: task.description,
            instructions: task.instructions ?? '',
            due_at: this.asLocalDateTime(task.due_at),
            assigned_to: task.assigned_to ?? 0,
            priority: task.priority ?? 'normal',
          });
          this.editForm.markAsPristine();
          this.editForm.markAsUntouched();
          this.editSelectedFile.set(null);
          this.editing.set(true);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'Les responsables disponibles n’ont pas pu être chargés.')),
      });
  }

  saveEdit(): void {
    const task = this.task();
    if (!task) {
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const details = this.editForm.getRawValue();
    const attachment = this.editSelectedFile();
    let taskDetailsSaved = false;
    this.busy.set(true);
    this.error.set('');
    this.workspace.updateTask(task.id, {
      ...details,
      due_at: details.due_at ? new Date(details.due_at).toISOString() : null,
      assigned_to: Number(details.assigned_to),
    })
      .pipe(
        switchMap(() => {
          taskDetailsSaved = true;
          return attachment
            ? this.workspace.addActivity(task.id, 'Document joint lors de la modification de la tâche.', attachment)
            : of(null);
        }),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.editing.set(false);
          this.editSelectedFile.set(null);
          this.info.set('Les informations de la tâche ont été mises à jour.');
          this.loadTask(task.id);
        },
        error: (error: unknown) => this.error.set(taskDetailsSaved
          ? `La tâche a été mise à jour, mais le document n’a pas pu être envoyé : ${this.readError(error, 'réessayez depuis le fil de suivi.')}`
          : this.readError(error, 'La modification de la tâche a échoué.')),
      });
  }

  onEditFileSelected(event: Event): void {
    this.editSelectedFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  deleteTask(task: Task): void {
    this.deleteConfirmationTask.set(task);
  }

  confirmDeleteTask(): void {
    const task = this.deleteConfirmationTask();
    if (!task) {
      return;
    }

    this.deleteConfirmationTask.set(null);
    this.busy.set(true);
    this.error.set('');
    this.workspace.deleteTask(task.id)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.router.navigateByUrl('/tasks');
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'La suppression de la tâche a échoué.')),
      });
  }

  closeDeleteConfirmation(): void {
    if (!this.busy()) {
      this.deleteConfirmationTask.set(null);
    }
  }

  handleEscape(): void {
    if (this.deleteConfirmationTask()) {
      this.closeDeleteConfirmation();
      return;
    }

    this.closeAttachmentPreview();
  }

  beginReassignment(task: Task): void {
    this.busy.set(true);
    this.error.set('');
    this.workspace.reassignmentOptions(task.id)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.reassignmentAgents.set(data);
          this.selectedReassignmentAgentId.set(data[0]?.id ?? null);
          this.reassigning.set(true);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'Les agents disponibles n’ont pas pu être chargés.')),
      });
  }

  changeReassignmentAgent(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedReassignmentAgentId.set(Number.isInteger(id) && id > 0 ? id : null);
  }

  reassignTask(): void {
    const task = this.task();
    const agentId = this.selectedReassignmentAgentId();
    if (!task || agentId === null) {
      this.error.set('Choisissez un agent actif pour réaffecter cette tâche.');
      return;
    }

    this.reassigning.set(false);
    this.runTaskAction(
      this.workspace.reassignTask(task.id, agentId),
      'La tâche a été réaffectée et son nouveau responsable a été informé.',
    );
  }

  download(activity: TaskActivity): void {
    if (!activity.attachment_url) {
      return;
    }

    this.error.set('');
    this.workspace.downloadAttachment(activity.attachment_url).subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = activity.attachment_name || 'piece-jointe';
        link.click();
        globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (error: unknown) => this.error.set(this.readError(error, 'Le fichier n’a pas pu être téléchargé.')),
    });
  }

  canPreview(activity: TaskActivity): boolean {
    return /\.(pdf|jpe?g|png|webp)$/i.test(activity.attachment_name ?? '');
  }

  attachmentTypeLabel(activity: TaskActivity): string {
    const extension = activity.attachment_name?.split('.').pop()?.toUpperCase();
    return extension && this.canPreview(activity) ? extension : 'FICHIER';
  }

  preview(activity: TaskActivity): void {
    if (!activity.attachment_url || !this.canPreview(activity)) {
      return;
    }

    this.error.set('');
    this.previewRequest?.unsubscribe();
    this.previewLoadingId.set(activity.id);
    this.previewRequest = this.workspace.downloadAttachment(activity.attachment_url).subscribe({
      next: (blob) => {
        this.releasePreviewUrl();
        const extension = activity.attachment_name?.split('.').pop()?.toLowerCase();
        const mimeType = extension === 'pdf' ? 'application/pdf'
          : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
            : extension === 'png' ? 'image/png' : 'image/webp';
        const isImage = mimeType.startsWith('image/');
        this.previewObjectUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));
        this.attachmentPreview.set({
          name: activity.attachment_name || (isImage ? 'Image' : 'Document PDF'),
          url: this.previewObjectUrl,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl),
          isImage,
        });
        this.previewLoadingId.set(null);
        this.previewRequest = null;
      },
      error: (error: unknown) => {
        this.previewLoadingId.set(null);
        this.previewRequest = null;
        this.error.set(this.readError(error, 'La pièce jointe n’a pas pu être affichée.'));
      },
    });
  }

  downloadPreview(): void {
    const preview = this.attachmentPreview();
    if (!preview || !this.previewObjectUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = this.previewObjectUrl;
    link.download = preview.name;
    link.click();
  }

  closeAttachmentPreview(): void {
    if (!this.attachmentPreview() && this.previewLoadingId() === null) {
      return;
    }
    this.previewRequest?.unsubscribe();
    this.previewRequest = null;
    this.attachmentPreview.set(null);
    this.previewLoadingId.set(null);
    this.releasePreviewUrl();
  }

  private releasePreviewUrl(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  private loadTask(id: number): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.task.set(null);
    this.error.set('');
    this.workspace.task(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.task.set(response.data.task),
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
            return;
          }

          this.error.set(this.readError(error, 'La tâche n’a pas pu être chargée.'));
        },
      });
  }

  private runTaskAction(request: Observable<ApiTaskResponse>, message: string): void {
    const task = this.task();
    if (!task) {
      return;
    }

    this.busy.set(true);
    this.error.set('');
    request
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.info.set(message);
          this.loadTask(task.id);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'Cette action n’a pas pu être enregistrée.')),
      });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }

  private asLocalDateTime(value: string | null): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

    return localDate.toISOString().slice(0, 16);
  }

  taskStatusLabel(task: Task): string {
    return task.status === 'assigned' && task.created_by === this.user()?.id
      ? 'Envoyée'
      : this.statusLabels[task.status];
  }

  isTaskRequester(task: Task): boolean {
    return task.status === 'assigned' && task.created_by === this.user()?.id;
  }
}
