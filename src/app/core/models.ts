export type UserRole = string;
export type PagePermissionKey = 'dashboard' | 'tasks' | 'team' | 'profile' | 'audit';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ExtensionStatus = 'pending' | 'approved' | 'rejected';
export type PermissionKey = PagePermissionKey | 'create_tasks';
export type ProfileStatus = 'pending' | 'active' | 'rejected' | 'suspended';
export type TaskStatus =
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'needs_revision'
  | 'paused'
  | 'completed'
  | 'rejected';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  capability_role?: UserRole;
  role_name?: string;
  department: string | null;
  division: string | null;
  division_id: number | null;
  divisionRecord?: Pick<Division, 'id' | 'name' | 'department'> | null;
  profile_photo_url: string | null;
  phone?: string | null;
  profile_status: ProfileStatus;
  allowed_pages?: PermissionKey[] | null;
  created_at?: string;
}

export interface OrganizationRole {
  id: number;
  slug: UserRole;
  name: string;
  parent_slug: UserRole | null;
  capability_role: UserRole;
  position: number;
  is_system: boolean;
}

export interface PrivacyPolicy {
  content: string;
  is_published: boolean;
  published_at: string | null;
}

export interface PublicPrivacyPolicy {
  content: string | null;
  published_at: string | null;
}

export interface TaskActivity {
  id: number;
  body: string;
  attachment_name: string | null;
  attachment_url: string | null;
  created_at: string;
  user: Pick<User, 'id' | 'name'>;
}

export interface Task {
  id: number;
  created_by: number;
  assigned_to: number | null;
  title: string;
  description: string;
  instructions: string | null;
  department: string;
  division: string | null;
  due_at: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  is_overdue: boolean;
  extension_status: ExtensionStatus | null;
  requested_due_at: string | null;
  extension_reason: string | null;
  rejected_reason: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  creator: Pick<User, 'id' | 'name' | 'role'>;
  assignee: Pick<User, 'id' | 'name' | 'role'> | null;
  rejected_by: Pick<User, 'id' | 'name'> | null;
  activities: TaskActivity[];
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface ApiTaskResponse {
  data: { task: Task };
}

export interface DashboardStats {
  tasks_total: number;
  tasks_by_status: Partial<Record<TaskStatus, number>>;
  tasks_due_soon: number;
  tasks_overdue?: number;
  tasks_by_priority?: Partial<Record<TaskPriority, number>>;
  users_pending?: number;
  users_total?: number;
  tasks_pending_review?: number;
}

export type TeamMember = Pick<
  User,
  'id' | 'name' | 'email' | 'role' | 'department' | 'division' | 'division_id' | 'profile_status' | 'created_at'
>;

export interface Division {
  id: number;
  name: string;
  department: string;
  members_count?: number;
  active_members_count?: number;
  manager?: Pick<User, 'id' | 'name' | 'email' | 'profile_status'> | null;
}

export interface DivisionDeletionLog {
  id: number;
  name: string;
  department: string;
  members_count: number;
  paused_tasks_count: number;
  deleted_at: string;
  deleted_by: Pick<User, 'id' | 'name'> | null;
}

export interface UserDetail {
  user: User;
  team_members: TeamMember[];
}

export interface AppNotification {
  id: string;
  read_at: string | null;
  data: { title: string; message: string; task_id: number | null; can_start?: boolean };
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  description: string;
  created_at: string;
  ip_address?: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  user: Pick<User, 'id' | 'name'> | null;
}
