import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PrivacyPolicy } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';

@Component({
  selector: 'app-privacy-policy-settings-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './privacy-policy-settings-page.html',
  styleUrl: './privacy-policy-settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicySettingsPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);

  readonly policy = signal<PrivacyPolicy | null>(null);
  readonly policyDraft = signal('');
  readonly loadingPolicy = signal(true);
  readonly savingPolicy = signal(false);
  readonly policyError = signal('');
  readonly policySuccess = signal('');
  readonly policyChanged = computed(() => this.policyDraft() !== (this.policy()?.content ?? ''));

  ngOnInit(): void {
    this.loadPolicy();
  }

  changePolicyDraft(event: Event): void {
    this.policyDraft.set((event.target as HTMLTextAreaElement).value);
    this.policyError.set('');
    this.policySuccess.set('');
  }

  publishPolicy(): void {
    const content = this.policyDraft().trim();
    if (!content) {
      this.policyError.set('Saisissez le texte de la politique avant de la publier.');
      return;
    }

    this.savingPolicy.set(true);
    this.policyError.set('');
    this.policySuccess.set('');
    this.workspace.publishPrivacyPolicy(content).subscribe({
      next: ({ data }) => {
        this.policy.set(data);
        this.policyDraft.set(data.content);
        this.policySuccess.set('La politique de confidentialité a été publiée.');
        this.savingPolicy.set(false);
      },
      error: (error: unknown) => {
        this.policyError.set(this.readError(error, 'La politique n’a pas pu être publiée. Réessayez.'));
        this.savingPolicy.set(false);
      },
    });
  }

  private loadPolicy(): void {
    this.loadingPolicy.set(true);
    this.policyError.set('');
    this.workspace.privacyPolicy().subscribe({
      next: ({ data }) => {
        this.policy.set(data);
        this.policyDraft.set(data.content);
        this.loadingPolicy.set(false);
      },
      error: (error: unknown) => {
        this.policyError.set(this.readError(error, 'La politique de confidentialité n’a pas pu être chargée.'));
        this.loadingPolicy.set(false);
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
