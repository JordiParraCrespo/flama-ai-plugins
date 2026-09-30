import type { SocialSignInProvider } from '@flama/frontend-core/di';

/**
 * The social sign-in providers this app offers, which `flama.ts` passes to
 * `FlamaApp.create`: the kit draws a button for each one the API reports
 * configured, with the mark the design system's brand set has under `icon`.
 * One entry per provider; drop a provider by deleting its entry.
 */
export const socialProviders: SocialSignInProvider[] = [
  { id: 'google', name: 'Google', capability: 'google_oauth', icon: 'google' },
  { id: 'github', name: 'GitHub', capability: 'github_oauth', icon: 'github' },
];
