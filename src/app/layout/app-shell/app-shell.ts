import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { AppPage, canAccess } from '../../core/access';
import { AuthService } from '../../core/auth.service';
import { AppNotification } from '../../core/models';
import { ThemeService } from '../../core/theme.service';
import { roleLabels, WorkspaceService } from '../../core/workspace.service';
import { Icon } from '../../shared/icon';

/** Durée d’inactivité avant déconnexion automatique (exigence de sécurité du cahier des charges). */
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 5 * 60 * 1000;

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  host: {
    '[attr.data-theme]': "darkMode() ? 'dark' : 'light'",
    '(document:click)': 'closeTransientMenus()',
    '(document:keydown.escape)': 'closeAllMenus()',
    '(document:mousemove)': 'markActivity()',
    '(document:keydown)': 'markActivity()',
    '(document:touchstart)': 'markActivity()',
    '(document:scroll)': 'markActivity()',
  },
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly darkMode = this.theme.darkMode;
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private lastActivity = Date.now();

  readonly pageHeading = signal('');
  readonly idleWarning = signal(false);
  readonly idleSecondsLeft = signal(0);
  readonly year = new Date().getFullYear();

  canAccessPage(page: AppPage): boolean {
    return canAccess(this.user(), page);
  }

  roleLabel(): string {
    const user = this.user();
    return user ? (user.role_name ?? roleLabels[user.capability_role ?? user.role] ?? user.role) : '';
  }

  readonly mobileMenuOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly notificationsOpen = signal(false);
  readonly profileMenuOpen = signal(false);
  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly error = signal('');
  readonly startingTaskNotificationId = signal<string | null>(null);

  constructor() {
    this.loadNotifications();
    this.updateHeading();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.updateHeading());

    const timer = setInterval(() => this.checkIdle(), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** Réinitialise le compteur d’inactivité (sauf pendant l’avertissement, où il faut confirmer). */
  markActivity(): void {
    if (!this.idleWarning()) {
      this.lastActivity = Date.now();
    }
  }

  stayConnected(): void {
    this.lastActivity = Date.now();
    this.idleWarning.set(false);
  }

  private checkIdle(): void {
    const idleFor = Date.now() - this.lastActivity;

    if (idleFor >= IDLE_LIMIT_MS) {
      this.idleWarning.set(false);
      this.auth.logout().subscribe({
        next: () => void this.router.navigateByUrl('/login'),
        error: () => {
          this.auth.clearSession();
          void this.router.navigateByUrl('/login');
        },
      });
      return;
    }

    const warn = idleFor >= IDLE_LIMIT_MS - IDLE_WARNING_MS;
    this.idleWarning.set(warn);
    if (warn) {
      this.idleSecondsLeft.set(Math.max(0, Math.ceil((IDLE_LIMIT_MS - idleFor) / 1000)));
    }
  }

  private updateHeading(): void {
    let current = this.route.snapshot;
    while (current.firstChild) {
      current = current.firstChild;
    }
    this.pageHeading.set((current.data['heading'] as string | undefined) ?? '');
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  toggleNotifications(): void {
    this.profileMenuOpen.set(false);
    this.notificationsOpen.update((open) => !open);
    if (this.notificationsOpen()) {
      this.loadNotifications();
    }
  }

  openNotification(notification: AppNotification): void {
    if (!notification.data.task_id) {
      this.markReadWithoutNavigation(notification);
      return;
    }

    this.workspace.markNotificationRead(notification.id).subscribe({
      next: () => {
        this.notifications.update((items) =>
          items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item),
        );
        this.unreadCount.update((count) => Math.max(0, count - Number(!notification.read_at)));
        this.notificationsOpen.set(false);
        void this.router.navigate(['/tasks', notification.data.task_id]);
      },
      error: (error: unknown) => this.error.set(this.readError(error, 'Impossible de mettre à jour la notification.')),
    });
  }

  startTaskFromNotification(notification: AppNotification): void {
    const taskId = notification.data.task_id;
    if (!taskId || !notification.data.can_start || this.startingTaskNotificationId()) {
      return;
    }

    this.error.set('');
    this.startingTaskNotificationId.set(notification.id);
    this.workspace.startTask(taskId)
      .pipe(finalize(() => this.startingTaskNotificationId.set(null)))
      .subscribe({
        next: () => {
          this.workspace.markNotificationRead(notification.id).subscribe({
            next: () => this.markNotificationReadLocally(notification),
            error: (error: unknown) => {
              this.error.set(this.readError(error, 'La tâche a démarré, mais la notification n’a pas pu être marquée comme lue.'));
              this.loadNotifications();
            },
          });
          this.notificationsOpen.set(false);
          void this.router.navigate(['/tasks', taskId]);
        },
        error: (error: unknown) => this.error.set(this.readError(error, 'La tâche n’a pas pu être démarrée. Ouvrez-la pour vérifier son état.')),
      });
  }

  private markNotificationReadLocally(notification: AppNotification): void {
    this.notifications.update((items) =>
      items.map((item) => item.id === notification.id
        ? { ...item, read_at: new Date().toISOString(), data: { ...item.data, can_start: false } }
        : item),
    );
    this.unreadCount.update((count) => Math.max(0, count - Number(!notification.read_at)));
  }

  private markReadWithoutNavigation(notification: AppNotification): void {
    this.workspace.markNotificationRead(notification.id).subscribe({
      next: () => {
        this.notifications.update((items) =>
          items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item),
        );
        this.unreadCount.update((count) => Math.max(0, count - Number(!notification.read_at)));
      },
      error: (error: unknown) => this.error.set(this.readError(error, 'Impossible de mettre à jour la notification.')),
    });
  }

  signOut(): void {
    this.error.set('');
    this.profileMenuOpen.set(false);
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.error.set(this.readError(error, 'La déconnexion a échoué. Réessayez.')),
    });
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  toggleNavigationMenu(): void {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      this.toggleMobileMenu();
      return;
    }

    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  navigationMenuExpanded(): boolean {
    return window.matchMedia('(max-width: 1023px)').matches
      ? this.mobileMenuOpen()
      : !this.sidebarCollapsed();
  }

  toggleProfileMenu(): void {
    this.notificationsOpen.set(false);
    this.profileMenuOpen.update((open) => !open);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  closeTransientMenus(): void {
    this.closeProfileMenu();
    this.notificationsOpen.set(false);
  }

  closeAllMenus(): void {
    this.closeTransientMenus();
    this.closeMobileMenu();
  }

  private loadNotifications(): void {
    this.workspace.notifications().subscribe({
      next: (response) => {
        this.notifications.set(response.data);
        this.unreadCount.set(response.unread_count);
      },
      error: (error: unknown) => this.error.set(this.readError(error, 'Les notifications n’ont pas pu être chargées.')),
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }
}
