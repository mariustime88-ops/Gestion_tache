import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { firstAccessiblePath } from '../../core/access';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    this.error.set('');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    this.auth.login(this.loginForm.getRawValue())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: ({ data }) => void this.router.navigateByUrl(firstAccessiblePath(data.user)),
        error: (error: unknown) => this.error.set(this.readError(error)),
      });
  }

  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  private readError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      const firstFieldError = Object.values(error.error?.errors ?? {})[0] as string[] | undefined;

      if (firstFieldError?.[0]) {
        return firstFieldError[0];
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return 'Connexion impossible. Vérifiez vos identifiants.';
  }
}
