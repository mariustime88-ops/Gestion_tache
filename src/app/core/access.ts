import { PagePermissionKey, User, UserRole } from './models';

/** Pages de l’application, y compris celles qui ne dépendent que du rôle. */
export type AppPage = PagePermissionKey | 'organization' | 'settings';

export const OPERATIONAL_ROLES: UserRole[] = ['dg', 'manager', 'division_manager', 'agent'];

/** Droits par défaut selon le rôle (rôle « capacité » du profil). */
const ROLE_PAGES: Record<PagePermissionKey, UserRole[]> = {
  dashboard: OPERATIONAL_ROLES,
  tasks: OPERATIONAL_ROLES,
  team: ['dg'],
  profile: OPERATIONAL_ROLES,
  audit: ['dg'],
};

export function capabilityOf(user: User | null): UserRole | null {
  return user ? (user.capability_role ?? user.role) : null;
}

/**
 * Règle d’accès unique, fondée sur le rôle de l’utilisateur (et non sur le statut de son profil).
 * L’administrateur accède à tout ; les pages organisation et paramètres restent réservées à l’administrateur.
 */
export function canAccess(user: User | null, page: AppPage): boolean {
  if (!user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  if (page === 'organization' || page === 'settings') {
    return false;
  }

  if (Array.isArray(user.allowed_pages)) {
    return user.allowed_pages.includes(page);
  }

  return ROLE_PAGES[page].includes(capabilityOf(user) as UserRole);
}

/** Première page accessible, utilisée pour rediriger après connexion ou refus d’accès. */
export function firstAccessiblePath(user: User | null): string {
  const candidates: [AppPage, string][] = [
    ['dashboard', '/dashboard'],
    ['tasks', '/tasks'],
    ['team', '/team'],
    ['audit', '/audit'],
    ['profile', '/profile'],
  ];

  return candidates.find(([page]) => canAccess(user, page))?.[1] ?? '/login';
}
