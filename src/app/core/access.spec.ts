import { canAccess, firstAccessiblePath } from './access';
import { User } from './models';

function makeUser(role: string, overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: 'Test',
    email: 'test@exemple.bj',
    role,
    department: null,
    division: null,
    division_id: null,
    profile_photo_url: null,
    profile_status: 'active',
    ...overrides,
  };
}

describe('Droits d’accès par rôle', () => {
  it('donne tous les accès à l’administrateur', () => {
    const admin = makeUser('admin');

    for (const page of ['dashboard', 'tasks', 'team', 'profile', 'audit', 'organization', 'settings'] as const) {
      expect(canAccess(admin, page)).toBe(true);
    }
  });

  it('réserve l’équipe et le journal d’audit au DG (et à l’administrateur)', () => {
    const dg = makeUser('dg');

    expect(canAccess(dg, 'team')).toBe(true);
    expect(canAccess(dg, 'audit')).toBe(true);
    expect(canAccess(makeUser('dg', { allowed_pages: ['dashboard'] }), 'audit')).toBe(false);
    expect(canAccess(makeUser('dg', { allowed_pages: ['audit'] }), 'audit')).toBe(true);
    expect(firstAccessiblePath(makeUser('dg', { allowed_pages: ['audit'] }))).toBe('/audit');
    expect(canAccess(dg, 'organization')).toBe(false);
    expect(canAccess(dg, 'settings')).toBe(false);
  });

  it('limite le chef de service, le chef de division et l’agent aux pages de travail', () => {
    for (const role of ['manager', 'division_manager', 'agent']) {
      const user = makeUser(role);

      expect(canAccess(user, 'dashboard')).toBe(true);
      expect(canAccess(user, 'tasks')).toBe(true);
      expect(canAccess(user, 'profile')).toBe(true);
      expect(canAccess(user, 'team')).toBe(false);
      expect(canAccess(user, 'audit')).toBe(false);
      expect(canAccess(user, 'organization')).toBe(false);
    }
  });

  it('respecte la liste de pages autorisées d’un profil personnalisé', () => {
    const restricted = makeUser('agent', { allowed_pages: ['tasks'] });

    expect(canAccess(restricted, 'tasks')).toBe(true);
    expect(canAccess(restricted, 'dashboard')).toBe(false);
    expect(firstAccessiblePath(restricted)).toBe('/tasks');
  });

  it('refuse tout à un visiteur non connecté', () => {
    expect(canAccess(null, 'dashboard')).toBe(false);
    expect(firstAccessiblePath(null)).toBe('/login');
  });
});
