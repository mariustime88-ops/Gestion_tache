import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { User } from './models';

const API_URL = '/api';
const TOKEN_KEY = 'gestion-taches-token';
const USER_KEY = 'gestion-taches-user';

interface LoginResponse {
  data: { user: User; token: string };
}

interface ProfileResponse {
  message: string;
  data: { user: User };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<User | null>(this.readStoredUser());

  login(credentials: { email: string; password: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/auth/login`, credentials).pipe(
      tap(({ data }) => {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
        this.user.set(data.user);
      }),
    );
  }

  logout(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_URL}/auth/logout`, {}).pipe(
      tap(() => this.clearSession()),
    );
  }

  updateProfile(payload: FormData): Observable<ProfileResponse> {
    payload.set('_method', 'PATCH');

    return this.http.post<ProfileResponse>(`${API_URL}/profile`, payload).pipe(
      tap(({ data }) => {
        sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
        this.user.set(data.user);
      }),
    );
  }

  clearSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.user.set(null);
  }

  private readStoredUser(): User | null {
    const storedUser = sessionStorage.getItem(USER_KEY);
    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!storedUser || !token) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as User;
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      return null;
    }
  }
}
