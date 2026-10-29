import { Injectable, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'suivi-admin-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly darkMode = signal(localStorage.getItem(THEME_STORAGE_KEY) === 'dark');

  toggle(): void {
    const nextDarkMode = !this.darkMode();
    localStorage.setItem(THEME_STORAGE_KEY, nextDarkMode ? 'dark' : 'light');
    this.darkMode.set(nextDarkMode);
  }
}
