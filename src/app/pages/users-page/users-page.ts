import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { Division, DivisionDeletionLog, OrganizationRole, PagePermissionKey, Paginated, PermissionKey, TeamMember, User, UserDetail, UserRole } from '../../core/models';
import { profileStatusLabels, roleLabels, WorkspaceService } from '../../core/workspace.service';

type UserTab = 'all' | UserRole | 'divisions';
type FormMode = 'create-user' | 'edit-user' | 'create-division' | 'edit-division' | 'create-role' | null;
type ToastKind = 'success' | 'error';

interface ActionToast {
  kind: ToastKind;
  message: string;
}

interface UserDraft {
  id: number | null;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: string;
  division_id: number | null;
  phone: string;
  allowed_pages: PermissionKey[];
}

interface PagePermissionOption {
  key: PermissionKey;
  label: string;
  description: string;
  capabilityRoles: UserRole[];
}

interface DivisionDraft {
  id: number | null;
  name: string;
  department: string;
  manager_id: number | null;
}

interface RoleDraft {
  name: string;
  parent_slug: string;
}

@Component({
  selector: 'app-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage implements OnInit, OnDestroy {
  readonly pagePermissions: PagePermissionOption[] = [
    {
      key: 'dashboard',
      label: 'Tableau de bord',
      description: 'Consulter les indicateurs et le suivi global.',
      capabilityRoles: ['dg', 'manager', 'division_manager', 'agent'],
    },
    {
      key: 'tasks',
      label: 'Tâches',
      description: 'Consulter et traiter les tâches selon le rôle.',
      capabilityRoles: ['dg', 'manager', 'division_manager', 'agent'],
    },
    {
      key: 'create_tasks',
      label: 'Ajouter des tâches',
      description: 'Créer et affecter des tâches selon la hiérarchie (accès à la page Tâches inclus).',
      capabilityRoles: ['dg', 'manager', 'division_manager'],
    },
    {
      key: 'team',
      label: 'Équipe',
      description: 'Consulter les profils de son périmètre hiérarchique.',
      capabilityRoles: ['dg'],
    },
    {
      key: 'profile',
      label: 'Mon profil',
      description: 'Consulter et modifier ses informations personnelles.',
      capabilityRoles: ['dg', 'manager', 'division_manager', 'agent'],
    },
    {
      key: 'audit',
      label: 'Journal d’audit',
      description: 'Consulter les événements d’administration et de sécurité.',
      capabilityRoles: ['dg'],
    },
  ];

  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchChanges = new Subject<void>();
  private divisionsLoaded = false;
  private divisionsRequestInFlight = false;

  readonly users = signal<User[]>([]);
  readonly divisions = signal<Division[]>([]);
  readonly divisionDeletionHistory = signal<DivisionDeletionLog[]>([]);
  readonly divisionManagers = signal<Pick<User, 'id' | 'name' | 'department' | 'division' | 'role'>[]>([]);
  readonly divisionsLoading = signal(false);
  readonly divisionManagersLoading = signal(false);
  readonly visibleDivisions = computed(() => {
    const normalized = this.search().trim().toLocaleLowerCase('fr');
    if (!normalized) {
      return this.divisions();
    }

    return this.divisions().filter((division) =>
      `${division.name} ${division.department}`.toLocaleLowerCase('fr').includes(normalized));
  });
  readonly availableDivisions = computed(() => {
    const department = this.profileDivisionDepartment();
    if (!department) {
      return this.divisions();
    }
    return this.divisions().filter((division) => division.department === department);
  });
  readonly availableDepartments = computed(() =>
    [...new Set(this.divisions().map((division) => division.department))]
      .sort((left, right) => left.localeCompare(right, 'fr')),
  );
  readonly total = signal(0);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly pageSize = 5;
  readonly pageNumbers = computed(() => {
    const lastPage = this.lastPage();
    const firstPage = Math.max(1, Math.min(this.page() - 2, lastPage - 4));
    const finalPage = Math.min(lastPage, firstPage + 4);

    return Array.from({ length: finalPage - firstPage + 1 }, (_, index) => firstPage + index);
  });
  readonly displayFrom = computed(() => this.total() ? (this.page() - 1) * this.pageSize + 1 : 0);
  readonly displayTo = computed(() => Math.min(this.page() * this.pageSize, this.total()));
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deletingDivisionId = signal<number | null>(null);
  readonly busyUserId = signal<number | null>(null);
  readonly selectedRole = signal<UserTab>('all');
  readonly formMode = signal<FormMode>(null);
  readonly selectedUser = signal<UserDetail | null>(null);
  readonly detailTab = signal<'information' | 'access' | 'team'>('information');
  readonly divisionToDelete = signal<Division | null>(null);
  readonly pendingProfileStatus = signal<{
    user: Pick<User, 'id' | 'name' | 'profile_status'>;
    status: 'active' | 'suspended';
  } | null>(null);
  readonly error = signal('');
  readonly toast = signal<ActionToast | null>(null);
  readonly search = signal('');
  readonly roleLabels = roleLabels;
  readonly currentUser = this.auth.user;
  readonly profileStatusLabels = profileStatusLabels;
  readonly roleTabs = computed(() => [
    { label: 'Tous les profils', value: 'all' as UserTab },
    ...this.workspace.organizationRoles().map((role) => ({
      label: role.name,
      value: role.slug as UserTab,
    })),
    { label: 'Divisions', value: 'divisions' as UserTab },
  ]);

  profileDraft: UserDraft = this.emptyUserDraft();
  divisionDraft: DivisionDraft = this.emptyDivisionDraft();
  roleDraft: RoleDraft = { name: '', parent_slug: '' };
  private readonly profileDivisionDepartment = signal<string | null>(null);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.searchChanges.pipe(
      debounceTime(250),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      if (this.selectedRole() !== 'divisions') {
        this.loadUsers();
      }
    });
  }

  ngOnInit(): void {
    this.loadUsers();
    this.workspace.loadOrganizationRoles().subscribe({
      next: ({ data }) => {
        this.workspace.organizationRoles.set(data);
        if (!this.roleDraft.parent_slug) {
          this.roleDraft.parent_slug = data.find((role) => role.slug === 'agent')?.slug ?? '';
        }
      },
      error: (error: unknown) => this.error.set(this.readError(error, 'Les rôles de l’organisation n’ont pas pu être chargés.')),
    });
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('createRole') === '1' && this.currentUser()?.role === 'admin') {
        this.openCreateRole();
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { createRole: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
    }
  }

  selectTab(tab: UserTab): void {
    this.selectedRole.set(tab);
    this.page.set(1);
    this.error.set('');
    if (tab === 'divisions') {
      this.loadDivisions();
    } else {
      this.loadUsers();
    }
  }

  loadUsers(page = this.page()): void {
    this.loading.set(true);
    const role = this.selectedRole();
    this.workspace.users(page, role === 'all' || role === 'divisions' ? '' : role, this.search()).subscribe({
      next: (response: Paginated<User>) => {
        this.users.set(response.data);
        this.total.set(response.total);
        this.page.set(response.current_page);
        this.lastPage.set(response.last_page);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La liste des profils n’a pas pu être chargée.'));
        this.loading.set(false);
      },
    });
  }

  loadDivisions(): void {
    if (this.divisionsLoaded || this.divisionsRequestInFlight) {
      return;
    }

    this.divisionsRequestInFlight = true;
    this.divisionsLoading.set(true);
    this.workspace.divisions().subscribe({
      next: ({ data, deletion_history }) => {
        this.divisions.set(data);
        this.divisionDeletionHistory.set(deletion_history);
        this.divisionsLoaded = true;
        this.divisionsRequestInFlight = false;
        this.divisionsLoading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La liste des divisions n’a pas pu être chargée.'));
        this.divisionsRequestInFlight = false;
        this.divisionsLoading.set(false);
      },
    });
  }

  changeSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
    if (this.selectedRole() === 'divisions') {
      return;
    }
    this.searchChanges.next();
  }

  onSearchInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.changeSearch(event.target.value);
    }
  }

  changePage(page: number): void {
    if (page < 1 || page > this.lastPage()) {
      return;
    }
    this.loadUsers(page);
  }

  hideBrokenPhoto(event: Event): void {
    if (event.target instanceof HTMLImageElement) {
      event.target.hidden = true;
    }
  }

  openCreateUser(): void {
    this.loadDivisions();
    this.profileDraft = this.emptyUserDraft();
    this.profileDivisionDepartment.set(null);
    this.formMode.set('create-user');
    this.selectedUser.set(null);
    this.error.set('');
  }

  openEditUser(user: User | TeamMember): void {
    this.loadDivisions();
    this.profileDivisionDepartment.set(null);
    const allowedPages = 'allowed_pages' in user ? user.allowed_pages : null;
    this.profileDraft = {
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      department: user.department ?? '',
      division_id: user.division_id,
      phone: ('phone' in user ? user.phone : null) ?? '',
      allowed_pages: allowedPages ? [...allowedPages] : this.defaultPagePermissions(user.role),
    };
    this.formMode.set('edit-user');
    this.selectedUser.set(null);
    this.error.set('');
  }

  onDraftRoleChanged(role: UserRole): void {
    const previouslyAvailable = new Set(this.availablePagePermissions().map((permission) => permission.key));
    this.profileDraft.role = role;
    const capabilityRole = this.capabilityRoleFor(role);
    const available = this.availablePagePermissions().map((permission) => permission.key);
    const selected = new Set(this.profileDraft.allowed_pages.filter((page) => available.includes(page)));
    for (const page of available) {
      if (!previouslyAvailable.has(page)) {
        selected.add(page);
      }
    }
    this.profileDraft.allowed_pages = [...selected];
    if (capabilityRole === 'manager') {
      this.profileDraft.division_id = null;
    } else if (capabilityRole !== 'agent' && capabilityRole !== 'division_manager') {
      this.profileDraft.department = '';
      this.profileDraft.division_id = null;
    }
  }

  saveProfile(): void {
    if (!this.profileDraft.name.trim() || !this.profileDraft.email.trim()) {
      this.error.set('Le nom et l’adresse e-mail sont obligatoires.');
      return;
    }

    if (this.formMode() === 'create-user' && this.profileDraft.password.length < 8) {
      this.error.set('Le mot de passe initial doit contenir au moins 8 caractères.');
      return;
    }

    if (this.profileDraft.allowed_pages.length === 0) {
      this.error.set('Sélectionnez au moins une page à autoriser.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const details = {
      name: this.profileDraft.name.trim(),
      email: this.profileDraft.email.trim(),
      password: this.profileDraft.password,
      role: this.profileDraft.role,
      department: this.profileDraft.department.trim() || null,
      division_id: this.profileDraft.division_id,
      phone: this.profileDraft.phone.trim() || null,
      allowed_pages: [...this.profileDraft.allowed_pages],
    };

    const request = this.formMode() === 'create-user'
      ? this.workspace.createUser(details)
      : this.workspace.updateUser(this.profileDraft.id!, {
          name: details.name,
          role: details.role,
          department: details.department,
          division_id: details.division_id,
          phone: details.phone,
          allowed_pages: details.allowed_pages,
        });

    request.subscribe({
      next: () => {
        const wasCreated = this.profileDraft.id === null;
        this.formMode.set(null);
        this.error.set('');
        this.showToast('success', wasCreated
          ? 'Le profil a été créé et activé.'
          : 'Le profil a été mis à jour.');
        this.saving.set(false);
        this.loadUsers();
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'L’enregistrement du profil a échoué.'));
        this.showToast('error', this.error());
        this.saving.set(false);
      },
    });
  }

  openDetails(user: User | TeamMember): void {
    this.workspace.user(user.id).subscribe({
      next: ({ data }) => {
        this.detailTab.set('information');
        this.selectedUser.set(data);
      },
      error: (error: unknown) => this.error.set(this.readError(error, 'Les détails du profil n’ont pas pu être chargés.')),
    });
  }

  selectDetailTab(tab: 'information' | 'access' | 'team'): void {
    this.detailTab.set(tab);
  }

  closeDetails(): void {
    this.selectedUser.set(null);
  }

  addAgentToTeam(user: User): void {
    this.profileDraft = this.emptyUserDraft();
    this.profileDraft.role = 'agent';
    this.profileDraft.department = user.department ?? '';
    this.profileDraft.division_id = user.role === 'division_manager' ? user.division_id : null;
    this.profileDivisionDepartment.set(user.department);
    this.selectedUser.set(null);
    this.formMode.set('create-user');
    this.error.set('');
  }

  setProfileStatus(user: Pick<User, 'id' | 'name' | 'profile_status'>, profile_status: 'active' | 'suspended'): void {
    this.pendingProfileStatus.set({ user, status: profile_status });
    this.error.set('');
  }

  confirmProfileStatusChange(): void {
    const action = this.pendingProfileStatus();
    if (!action || this.busyUserId() !== null) {
      return;
    }

    this.busyUserId.set(action.user.id);
    this.error.set('');
    this.workspace.updateUser(action.user.id, { profile_status: action.status }).subscribe({
      next: () => {
        const message = action.status === 'suspended'
          ? `Le profil de ${action.user.name} est suspendu.`
          : `Le profil de ${action.user.name} est actif.`;
        this.showToast('success', message);
        this.busyUserId.set(null);
        this.pendingProfileStatus.set(null);
        this.loadUsers();
        const selectedUser = this.selectedUser()?.user;
        if (selectedUser) {
          this.openDetails(selectedUser);
        }
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La mise à jour du statut a échoué.'));
        this.showToast('error', this.error());
        this.busyUserId.set(null);
      },
    });
  }

  cancelProfileStatusChange(): void {
    if (this.busyUserId() === null) {
      this.pendingProfileStatus.set(null);
    }
  }

  openCreateDivision(): void {
    this.divisionDraft = this.emptyDivisionDraft();
    this.loadDivisionManagers();
    this.formMode.set('create-division');
    this.error.set('');
  }

  openCreateRole(): void {
    const roles = this.workspace.organizationRoles();
    this.roleDraft = {
      name: '',
      parent_slug: roles.find((role) => role.slug === 'agent')?.slug ?? roles[roles.length - 1]?.slug ?? '',
    };
    this.formMode.set('create-role');
    this.error.set('');
  }

  saveRole(): void {
    const name = this.roleDraft.name.trim();
    if (!name || !this.roleDraft.parent_slug) {
      this.error.set('Le nom du rôle et son emplacement dans la hiérarchie sont obligatoires.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.workspace.createOrganizationRole({ name, parent_slug: this.roleDraft.parent_slug }).subscribe({
      next: ({ data }) => {
        this.workspace.organizationRoles.update((roles) => [...roles, data.role]
          .sort((a, b) => a.position - b.position || a.id - b.id));
        this.formMode.set(null);
        this.error.set('');
        this.showToast('success', `Le rôle « ${data.role.name} » a été ajouté au-dessus de « ${this.roleName(data.role.parent_slug)} ». Vous pouvez maintenant l’attribuer à un profil.`);
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La création du rôle a échoué.'));
        this.showToast('error', this.error());
        this.saving.set(false);
      },
    });
  }

  roleName(slug: string | null): string {
    if (!slug) {
      return 'la hiérarchie';
    }
    return this.workspace.organizationRoles().find((role) => role.slug === slug)?.name
      ?? this.roleLabels[slug]
      ?? slug;
  }

  capabilityRoleFor(role: UserRole): UserRole {
    return this.workspace.organizationRoles().find((item) => item.slug === role)?.capability_role ?? role;
  }

  availablePagePermissions(): PagePermissionOption[] {
    const available = new Set(this.defaultPagePermissions(this.profileDraft.role));
    return this.pagePermissions.filter((permission) => available.has(permission.key));
  }

  private defaultPagePermissions(role: UserRole): PermissionKey[] {
    const capabilityRole = this.capabilityRoleFor(role);
    const isCustomRole = this.workspace.organizationRoles()
      .some((item) => item.slug === role && !item.is_system);
    return this.pagePermissions.filter((permission) =>
      permission.key === 'create_tasks'
        ? permission.capabilityRoles.includes(capabilityRole) || isCustomRole
        : permission.capabilityRoles.includes(capabilityRole))
      .map((permission) => permission.key);
  }

  availableMenuPermissions(): PagePermissionOption[] {
    return this.pagePermissions.filter((permission) => permission.key !== 'create_tasks');
  }

  availableActionPermissions(): PagePermissionOption[] {
    return this.availablePagePermissions().filter((permission) => permission.key === 'create_tasks');
  }

  isPagePermissionAvailable(page: PermissionKey): boolean {
    return this.availablePagePermissions().some((permission) => permission.key === page);
  }

  allMenusSelected(): boolean {
    const permissions = this.availableMenuPermissions()
      .filter((permission) => this.isPagePermissionAvailable(permission.key));
    return permissions.length > 0 && permissions.every((permission) => this.profileDraft.allowed_pages.includes(permission.key));
  }

  toggleAllMenus(checked: boolean): void {
    const selected = new Set(this.profileDraft.allowed_pages);
    for (const permission of this.availableMenuPermissions()
      .filter((item) => this.isPagePermissionAvailable(item.key))) {
      if (checked) {
        selected.add(permission.key);
      } else {
        selected.delete(permission.key);
      }
    }
    if (!checked) {
      selected.delete('create_tasks');
    }
    this.profileDraft.allowed_pages = [...selected];
  }

  onAllMenusChange(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.toggleAllMenus(event.target.checked);
    }
  }

  hasPagePermission(user: User, page: PagePermissionKey): boolean {
    return user.allowed_pages?.includes(page) ?? false;
  }

  pagePermissionLabel(page: PermissionKey): string {
    return this.pagePermissions.find((permission) => permission.key === page)?.label ?? page;
  }

  togglePagePermission(page: PermissionKey, checked: boolean): void {
    const selected = new Set(this.profileDraft.allowed_pages);
    if (checked) {
      selected.add(page);
      if (page === 'create_tasks') {
        selected.add('tasks');
      }
    } else {
      selected.delete(page);
      if (page === 'tasks') {
        selected.delete('create_tasks');
      }
    }
    this.profileDraft.allowed_pages = [...selected];
  }

  onPagePermissionChange(page: PermissionKey, event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.togglePagePermission(page, event.target.checked);
    }
  }

  openEditDivision(division: Division): void {
    this.divisionDraft = {
      id: division.id,
      name: division.name,
      department: division.department,
      manager_id: division.manager?.id ?? null,
    };
    this.loadDivisionManagers();
    this.formMode.set('edit-division');
    this.error.set('');
  }

  private loadDivisionManagers(): void {
    this.divisionManagersLoading.set(true);
    this.workspace.managers().subscribe({
      next: ({ data }) => {
        this.divisionManagers.set(data.filter((manager) => manager.role === 'division_manager'));
        this.divisionManagersLoading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La liste des chefs de division n’a pas pu être chargée.'));
        this.divisionManagersLoading.set(false);
      },
    });
  }

  saveDivision(): void {
    const details = {
      name: this.divisionDraft.name.trim(),
      department: this.divisionDraft.department.trim(),
      manager_id: this.divisionDraft.manager_id,
    };
    if (!details.name || !details.department) {
      this.error.set('Le nom de la division et son service sont obligatoires.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const request = this.formMode() === 'create-division'
      ? this.workspace.createDivision(details)
      : this.workspace.updateDivision(this.divisionDraft.id!, details);
    request.subscribe({
      next: () => {
        const wasCreated = this.divisionDraft.id === null;
        this.formMode.set(null);
        this.error.set('');
        this.showToast('success', wasCreated ? 'La division a été créée.' : 'La division a été mise à jour.');
        this.saving.set(false);
        this.divisionsLoaded = false;
        this.loadDivisions();
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'L’enregistrement de la division a échoué.'));
        this.showToast('error', this.error());
        this.saving.set(false);
      },
    });
  }

  deleteDivision(division: Division): void {
    this.divisionToDelete.set(division);
    this.error.set('');
  }

  confirmDeleteDivision(): void {
    const division = this.divisionToDelete();
    if (!division || this.deletingDivisionId() !== null) {
      return;
    }

    this.deletingDivisionId.set(division.id);
    this.error.set('');
    this.workspace.deleteDivision(division.id).subscribe({
      next: () => {
        this.showToast('success', `La division ${division.name}, ses profils et leurs tâches actives ont été traités.`);
        this.divisionToDelete.set(null);
        this.deletingDivisionId.set(null);
        this.divisionsLoaded = false;
        this.loadDivisions();
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La division n’a pas pu être supprimée.'));
        this.showToast('error', this.error());
        this.deletingDivisionId.set(null);
      },
    });
  }

  cancelDeleteDivision(): void {
    if (this.deletingDivisionId() === null) {
      this.divisionToDelete.set(null);
    }
  }

  closeForm(): void {
    if (this.saving()) {
      return;
    }
    this.formMode.set(null);
    this.error.set('');
  }

  dismissToast(): void {
    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.toast.set(null);
  }

  private showToast(kind: ToastKind, message: string): void {
    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
    }
    this.toast.set({ kind, message });
    this.toastTimeout = setTimeout(() => {
      this.toast.set(null);
      this.toastTimeout = null;
    }, 5000);
  }

  private emptyUserDraft(): UserDraft {
    return {
      id: null,
      name: '',
      email: '',
      password: '',
      role: 'agent',
      department: '',
      division_id: null,
      phone: '',
      allowed_pages: this.defaultPagePermissions('agent'),
    };
  }

  private emptyDivisionDraft(): DivisionDraft {
    return { id: null, name: '', department: '', manager_id: null };
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }
}
