import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { TeamMember } from '../../core/models';
import { roleLabels, WorkspaceService } from '../../core/workspace.service';

interface TeamDivision {
  key: string;
  name: string;
  members: TeamMember[];
}

interface OrganizationTeam {
  key: string;
  department: string;
  members: number;
  managers: TeamMember[];
  divisions: TeamDivision[];
  unassigned: TeamMember[];
}

@Component({
  selector: 'app-team-page',
  imports: [FormsModule],
  templateUrl: './team-page.html',
  styleUrl: './team-page.styles.scss',
})
export class TeamPage implements OnInit {
  readonly workspace = inject(WorkspaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchChanges = new Subject<void>();

  readonly members = signal<TeamMember[]>([]);
  readonly teams = computed<OrganizationTeam[]>(() => {
    const groups = new Map<string, OrganizationTeam & { divisionGroups: Map<string, TeamDivision> }>();
    for (const member of this.members()) {
      const department = member.department?.trim();
      if (!department) {
        continue;
      }

      const teamKey = department.toLocaleLowerCase('fr');
      const team = groups.get(teamKey) ?? {
        key: teamKey,
        department,
        members: 0,
        managers: [],
        divisions: [],
        unassigned: [],
        divisionGroups: new Map<string, TeamDivision>(),
      };
      team.members += 1;

      if (member.role === 'manager') {
        team.managers.push(member);
      } else if (member.division?.trim()) {
        const divisionKey = member.division_id === null
          ? member.division.trim().toLocaleLowerCase('fr')
          : String(member.division_id);
        const division = team.divisionGroups.get(divisionKey) ?? {
          key: divisionKey,
          name: member.division.trim(),
          members: [],
        };
        division.members.push(member);
        team.divisionGroups.set(divisionKey, division);
      } else {
        team.unassigned.push(member);
      }

      groups.set(teamKey, team);
    }

    return [...groups.values()]
      .map(({ divisionGroups, ...team }) => ({
        ...team,
        divisions: [...divisionGroups.values()]
          .map((division) => ({
            ...division,
            members: division.members.sort((left, right) => left.name.localeCompare(right.name, 'fr')),
          }))
          .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
        managers: team.managers.sort((left, right) => left.name.localeCompare(right.name, 'fr')),
        unassigned: team.unassigned.sort((left, right) => left.name.localeCompare(right.name, 'fr')),
      }))
      .sort((left, right) => left.department.localeCompare(right.department, 'fr'));
  });
  readonly pageSize = 2;
  readonly page = signal(1);
  readonly total = computed(() => this.members().length);
  readonly lastPage = computed(() => Math.max(1, Math.ceil(this.teams().length / this.pageSize)));
  readonly visibleTeams = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.teams().slice(start, start + this.pageSize);
  });
  readonly pageNumbers = computed(() => {
    const lastPage = this.lastPage();
    const firstPage = Math.max(1, Math.min(this.page() - 2, lastPage - 4));
    const finalPage = Math.min(lastPage, firstPage + 4);

    return Array.from({ length: finalPage - firstPage + 1 }, (_, index) => firstPage + index);
  });
  readonly displayFrom = computed(() => this.teams().length ? (this.page() - 1) * this.pageSize + 1 : 0);
  readonly displayTo = computed(() => Math.min(this.page() * this.pageSize, this.teams().length));
  readonly search = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly roleLabels = roleLabels;
  readonly initials = (name: string): string =>
    name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase('fr');

  constructor() {
    this.searchChanges.pipe(
      debounceTime(250),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.loadTeam());
  }

  ngOnInit(): void {
    this.loadTeam();
  }

  loadTeam(): void {
    this.loading.set(true);
    this.error.set('');
    this.workspace.team(this.search()).subscribe({
      next: (response) => {
        this.members.set(response.data);
        this.page.set(1);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.readError(error, 'La liste de l’équipe n’a pas pu être chargée.'));
        this.loading.set(false);
      },
    });
  }

  changeSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
    this.searchChanges.next();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.lastPage() || this.loading()) {
      return;
    }
    this.page.set(page);
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return fallback;
  }
}
