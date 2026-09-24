import { Flag, type LucideIcon, Shield, Users } from '@flama/design-system-web/icons';
import type { Messages } from '@flama/translations/locales';

export interface NavItem {
  to: '/users' | '/roles' | '/flags';
  icon: LucideIcon;
  labelKey: keyof Messages['nav'];
}

export const NAV = [
  { to: '/users', icon: Users, labelKey: 'users' },
  { to: '/roles', icon: Shield, labelKey: 'roles' },
  { to: '/flags', icon: Flag, labelKey: 'featureFlags' },
] as const satisfies readonly NavItem[];
