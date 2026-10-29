import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PublicPrivacyPolicy } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';

@Component({
  selector: 'app-privacy-policy-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './privacy-policy-page.html',
  styleUrl: './privacy-policy-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);

  readonly policy = signal<PublicPrivacyPolicy | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    this.workspace.publicPrivacyPolicy().subscribe({
      next: ({ data }) => {
        this.policy.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La politique de confidentialité est momentanément indisponible.'));
        this.loading.set(false);
      },
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }
}
