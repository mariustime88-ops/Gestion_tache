import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppPage, canAccess, firstAccessiblePath } from './access';
import { AuthService } from './auth.service';

/**
 * Protège une route selon le rôle : `data.page` désigne la page demandée.
 * Un utilisateur non connecté est renvoyé vers la connexion, un utilisateur sans droit vers sa première page autorisée.
 */
export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();

  if (!user) {
    return router.parseUrl('/login');
  }

  const page = route.data['page'] as AppPage | undefined;

  if (!page || canAccess(user, page)) {
    return true;
  }

  return router.parseUrl(firstAccessiblePath(user));
};
