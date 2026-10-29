import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Connexion — Suivi',
    loadComponent: () => import('./pages/auth-page/auth-page').then((module) => module.AuthPage),
  },
  { path: 'register', redirectTo: 'login' },
  {
    path: 'politique-confidentialite',
    title: 'Politique de confidentialité — Suivi',
    loadComponent: () => import('./pages/privacy-policy-page/privacy-policy-page').then((module) => module.PrivacyPolicyPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then((module) => module.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [authGuard],
        title: 'Tableau de bord — Suivi',
        data: { page: 'dashboard', heading: 'Tableau de bord' },
        loadComponent: () => import('./pages/dashboard-page/dashboard-page').then((module) => module.DashboardPage),
      },
      {
        path: 'tasks',
        canActivate: [authGuard],
        title: 'Tâches — Suivi',
        data: { page: 'tasks', heading: 'Tâches' },
        loadComponent: () => import('./pages/tasks-page/tasks-page').then((module) => module.TasksPage),
      },
      {
        path: 'tasks/:id',
        canActivate: [authGuard],
        title: 'Détail de la tâche — Suivi',
        data: { page: 'tasks', heading: 'Détail de la tâche' },
        loadComponent: () => import('./pages/task-detail-page/task-detail-page').then((module) => module.TaskDetailPage),
      },
      {
        path: 'team',
        canActivate: [authGuard],
        title: 'Équipe — Suivi',
        data: { page: 'team', heading: 'Équipe' },
        loadComponent: () => import('./pages/team-page/team-page').then((module) => module.TeamPage),
      },
      {
        path: 'audit',
        canActivate: [authGuard],
        title: 'Journal d’audit — Suivi',
        data: { page: 'audit', heading: 'Journal d’audit' },
        loadComponent: () => import('./pages/audit-page/audit-page').then((module) => module.AuditPage),
      },
      {
        path: 'profile',
        canActivate: [authGuard],
        title: 'Mon profil — Suivi',
        data: { page: 'profile', heading: 'Mon profil' },
        loadComponent: () => import('./pages/profile-page/profile-page').then((module) => module.ProfilePage),
      },
      {
        path: 'settings',
        pathMatch: 'full',
        canActivate: [authGuard],
        title: 'Paramètres — Suivi',
        data: { page: 'settings', heading: 'Paramètres' },
        loadComponent: () => import('./pages/settings-page/settings-page').then((module) => module.SettingsPage),
      },
      {
        path: 'settings/privacy-policy',
        canActivate: [authGuard],
        title: 'Politique de confidentialité — Paramètres',
        data: { page: 'settings', heading: 'Politique de confidentialité' },
        loadComponent: () => import('./pages/privacy-policy-settings-page/privacy-policy-settings-page').then((module) => module.PrivacyPolicySettingsPage),
      },
      {
        path: 'users',
        canActivate: [authGuard],
        title: 'Organisation et profils — Suivi',
        data: { page: 'organization', heading: 'Organisation et profils' },
        loadComponent: () => import('./pages/users-page/users-page').then((module) => module.UsersPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
