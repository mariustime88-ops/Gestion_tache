import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = sessionStorage.getItem('gestion-taches-token');
  const auth = inject(AuthService);
  const router = inject(Router);

  const authenticatedRequest = token
    ? request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      const isProtectedApiRequest = request.url.includes('/api/')
        && !request.url.includes('/api/auth/login')
        && !request.url.includes('/api/auth/register')
        && !request.url.includes('/api/public/');

      if (error instanceof HttpErrorResponse && error.status === 401 && isProtectedApiRequest && auth.user()) {
        auth.clearSession();
        void router.navigateByUrl('/login');
      }

      return throwError(() => error);
    }),
  );
};
