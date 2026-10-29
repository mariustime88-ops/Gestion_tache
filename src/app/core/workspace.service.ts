import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApiTaskResponse,
  AuditLogEntry,
  AppNotification,
  DashboardStats,
  Division,
  DivisionDeletionLog,
  OrganizationRole,
  PrivacyPolicy,
  PublicPrivacyPolicy,
  Paginated,
  Task,
  TaskActivity,
  TaskPriority,
  TaskStatus,
  TeamMember,
  User,
  UserDetail,
  UserRole,
  ProfileStatus,
  PagePermissionKey,
  PermissionKey,
} from './models';

const API_URL = '/api';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  readonly organizationRoles = signal<OrganizationRole[]>([]);

  loadOrganizationRoles(): Observable<{ data: OrganizationRole[] }> {
    return this.http.get<{ data: OrganizationRole[] }>(`${API_URL}/organization-roles`);
  }

  createOrganizationRole(details: { name: string; parent_slug: string }): Observable<{ data: { role: OrganizationRole } }> {
    return this.http.post<{ data: { role: OrganizationRole } }>(`${API_URL}/organization-roles`, details);
  }

  privacyPolicy(): Observable<{ data: PrivacyPolicy }> {
    return this.http.get<{ data: PrivacyPolicy }>(`${API_URL}/privacy-policy`);
  }

  publicPrivacyPolicy(): Observable<{ data: PublicPrivacyPolicy }> {
    return this.http.get<{ data: PublicPrivacyPolicy }>(`${API_URL}/public/privacy-policy`);
  }

  publishPrivacyPolicy(content: string): Observable<{ data: PrivacyPolicy }> {
    return this.http.put<{ data: PrivacyPolicy }>(`${API_URL}/privacy-policy`, { content });
  }

  dashboard(): Observable<{ data: DashboardStats }> {
    return this.http.get<{ data: DashboardStats }>(`${API_URL}/dashboard`);
  }

  tasks(status?: TaskStatus, page = 1, search = '', filters: TaskFilters = {}): Observable<Paginated<Task>> {
    return this.http.get<Paginated<Task>>(`${API_URL}/tasks`, {
      params: this.taskParams(status, search, filters).set('page', page),
    });
  }

  /** Export CSV (ouvrable dans Excel) des tâches visibles, avec les filtres courants. */
  exportTasks(status?: TaskStatus, search = '', filters: TaskFilters = {}): Observable<Blob> {
    return this.http.get(`${API_URL}/tasks/export`, {
      params: this.taskParams(status, search, filters),
      responseType: 'blob',
    });
  }

  requestExtension(taskId: number, details: { requested_due_at: string; reason: string }): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${taskId}/extension-request`, details);
  }

  decideExtension(taskId: number, decision: 'approved' | 'rejected', comment = ''): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${taskId}/extension-decision`, { decision, comment });
  }

  auditLogs(page = 1, search = '', action = ''): Observable<Paginated<AuditLogEntry>> {
    let params = new HttpParams().set('page', page);
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
    if (action) {
      params = params.set('action', action);
    }

    return this.http.get<Paginated<AuditLogEntry>>(`${API_URL}/audit-logs`, { params });
  }

  private taskParams(status: TaskStatus | undefined, search: string, filters: TaskFilters): HttpParams {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
    if (filters.priority) {
      params = params.set('priority', filters.priority);
    }
    if (filters.overdue) {
      params = params.set('overdue', 1);
    }

    return params;
  }

  task(id: number): Observable<ApiTaskResponse> {
    return this.http.get<ApiTaskResponse>(`${API_URL}/tasks/${id}`);
  }

  agents(): Observable<{ data: Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[] }> {
    return this.http.get<{ data: Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[] }>(`${API_URL}/agents`);
  }

  team(search = ''): Observable<{ data: TeamMember[]; total: number }> {
    let params = new HttpParams();
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<{ data: TeamMember[]; total: number }>(`${API_URL}/team`, { params });
  }

  managers(): Observable<{ data: Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'division_id' | 'role' | 'capability_role'>[] }> {
    return this.http.get<{ data: Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'division_id' | 'role' | 'capability_role'>[] }>(`${API_URL}/managers`);
  }

  createTask(details: {
    title: string;
    description: string;
    instructions: string;
    due_at: string | null;
    assigned_to: number;
    priority: TaskPriority;
  }): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks`, details);
  }

  updateTask(id: number, details: {
    title: string;
    description: string;
    instructions: string;
    due_at: string | null;
    assigned_to: number;
  }): Observable<ApiTaskResponse> {
    return this.http.patch<ApiTaskResponse>(`${API_URL}/tasks/${id}`, details);
  }

  deleteTask(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API_URL}/tasks/${id}`);
  }

  addActivity(taskId: number, body: string, attachment?: File): Observable<{ data: { activity: TaskActivity } }> {
    const payload = new FormData();
    if (body.trim()) {
      payload.set('body', body.trim());
    }
    if (attachment) {
      payload.set('attachment', attachment);
    }

    return this.http.post<{ data: { activity: TaskActivity } }>(
      `${API_URL}/tasks/${taskId}/activities`,
      payload,
    );
  }

  submitTask(id: number): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${id}/submit`, {});
  }

  startTask(id: number): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${id}/start`, {});
  }

  reviewTask(id: number, decision: 'accepted' | 'revision' | 'rejected', comment: string): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${id}/review`, { decision, comment });
  }

  rejectTask(id: number, reason: string): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${id}/admin-rejection`, { reason });
  }

  users(page = 1, role = '', search = ''): Observable<Paginated<User>> {
    let params = new HttpParams().set('page', page);
    if (role) {
      params = params.set('role', role);
    }
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<Paginated<User>>(`${API_URL}/users`, { params });
  }

  user(id: number): Observable<{ data: UserDetail }> {
    return this.http.get<{ data: UserDetail }>(`${API_URL}/users/${id}`);
  }

  createUser(details: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    department: string | null;
    division_id: number | null;
    phone: string | null;
    allowed_pages: PermissionKey[];
  }): Observable<{ data: { user: User } }> {
    return this.http.post<{ data: { user: User } }>(`${API_URL}/users`, details);
  }

  updateUser(id: number, details: Partial<Pick<User, 'name' | 'role' | 'profile_status' | 'department' | 'division_id' | 'phone' | 'allowed_pages'>>): Observable<{ data: { user: User } }> {
    return this.http.patch<{ data: { user: User } }>(`${API_URL}/users/${id}`, details);
  }

  divisions(): Observable<{ data: Division[]; deletion_history: DivisionDeletionLog[] }> {
    return this.http.get<{ data: Division[]; deletion_history: DivisionDeletionLog[] }>(`${API_URL}/divisions`);
  }

  createDivision(details: Pick<Division, 'name' | 'department'> & { manager_id: number | null }): Observable<{ data: { division: Division } }> {
    return this.http.post<{ data: { division: Division } }>(`${API_URL}/divisions`, details);
  }

  updateDivision(id: number, details: Pick<Division, 'name' | 'department'> & { manager_id: number | null }): Observable<{ data: { division: Division } }> {
    return this.http.patch<{ data: { division: Division } }>(`${API_URL}/divisions/${id}`, details);
  }

  deleteDivision(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API_URL}/divisions/${id}`);
  }

  reassignmentOptions(taskId: number): Observable<{ data: Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[] }> {
    return this.http.get<{ data: Pick<User, 'id' | 'name' | 'email' | 'department' | 'division' | 'role'>[] }>(
      `${API_URL}/tasks/${taskId}/reassignment-options`,
    );
  }

  reassignTask(taskId: number, assigned_to: number): Observable<ApiTaskResponse> {
    return this.http.post<ApiTaskResponse>(`${API_URL}/tasks/${taskId}/reassign`, { assigned_to });
  }

  notifications(): Observable<{ data: AppNotification[]; unread_count: number }> {
    return this.http.get<{ data: AppNotification[]; unread_count: number }>(`${API_URL}/notifications`);
  }

  roleName(slug: string): string {
    return this.organizationRoles().find((role) => role.slug === slug)?.name ?? roleLabels[slug] ?? slug;
  }

  markNotificationRead(id: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${API_URL}/notifications/${id}/read`, {});
  }

  downloadAttachment(url: string): Observable<Blob> {
    return this.http.get(url, { responseType: 'blob' });
  }
}

export const roleLabels: Record<string, string> = {
  admin: 'Administrateur IT',
  dg: 'Directeur général',
  manager: 'Chef de service',
  division_manager: 'Chef de division',
  agent: 'Agent',
};

export const profileStatusLabels: Record<ProfileStatus, string> = {
  pending: 'En attente',
  active: 'Actif',
  rejected: 'Refusé',
  suspended: 'Suspendu',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  assigned: 'Nouvelle',
  in_progress: 'En cours',
  submitted: 'Terminée · à valider',
  needs_revision: 'À refaire',
  paused: 'En attente de réaffectation',
  completed: 'Acceptée',
  rejected: 'Rejetée',
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

export interface TaskFilters {
  priority?: TaskPriority;
  overdue?: boolean;
}
