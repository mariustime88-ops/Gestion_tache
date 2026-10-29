import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly passwordChangeEnabled = signal(false);
  readonly photoError = signal('');
  readonly photoFile = signal<File | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly displayedPhoto = computed(
    () => this.photoPreview() ?? this.auth.user()?.profile_photo_url ?? null,
  );
  readonly user = this.auth.user;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    current_password: [''],
    password: ['', [Validators.minLength(8)]],
    password_confirmation: [''],
  });

  constructor() {
    this.form.controls.name.setValue(this.user()?.name ?? '');
  }

  togglePasswordChange(): void {
    this.passwordChangeEnabled.update((enabled) => !enabled);
    this.form.patchValue({
      current_password: '',
      password: '',
      password_confirmation: '',
    });
    this.form.controls.password.markAsUntouched();
  }

  selectPhoto(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.error.set('');
    this.photoError.set('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.photoFile.set(null);
      this.photoPreview.set(null);
      this.photoError.set('Choisissez une image JPG, PNG ou WebP de 5 Mo maximum.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.photoFile.set(file);
        this.photoPreview.set(reader.result);
      }
    };
    reader.onerror = () => this.photoError.set('La photo sélectionnée n’a pas pu être lue.');
    reader.readAsDataURL(file);
  }

  save(): void {
    this.error.set('');
    this.success.set('');
    this.photoError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const details = this.form.getRawValue();
    const changingPassword = this.passwordChangeEnabled();

    if (changingPassword && (!details.current_password || !details.password || !details.password_confirmation)) {
      this.error.set('Pour changer le mot de passe, indiquez l’ancien, le nouveau et sa confirmation.');
      return;
    }

    if (details.password && details.password !== details.password_confirmation) {
      this.error.set('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }

    const payload = new FormData();
    payload.set('name', details.name.trim());
    if (changingPassword) {
      payload.set('current_password', details.current_password);
      payload.set('password', details.password);
      payload.set('password_confirmation', details.password_confirmation);
    }
    const photoFile = this.photoFile();
    if (photoFile) {
      payload.set('photo', photoFile);
    }

    this.busy.set(true);
    this.auth.updateProfile(payload)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: ({ message }) => {
          this.success.set(message);
          this.photoFile.set(null);
          this.photoPreview.set(null);
          this.form.patchValue({
            current_password: '',
            password: '',
            password_confirmation: '',
          });
          this.passwordChangeEnabled.set(false);
        },
        error: (error: unknown) => this.error.set(this.readError(error)),
      });
  }

  private readError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const errors = error.error?.errors;
      if (errors && typeof errors === 'object') {
        const firstError = Object.values(errors)
          .flat()
          .find((message): message is string => typeof message === 'string');
        if (firstError) {
          return firstError;
        }
      }

      if (typeof error.error?.message === 'string') {
        return error.error.message;
      }
    }

    return 'La mise à jour du profil a échoué. Réessayez.';
  }
}
