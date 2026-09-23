import { Badge } from '@flama/design-system-web';
import type { FlagChange } from '@flama/frontend-admin';
import { useTranslation } from 'react-i18next';

/** What an audit entry did. A toggle says which way — that is the thing asked about at 2am. */
export function ChangeSummary({ change }: { change: FlagChange }) {
  const { t } = useTranslation();

  if (change.action === 'toggled') {
    const on = change.after?.enabled === true;
    return (
      <Badge variant={on ? 'active' : 'paused'}>
        {t(on ? 'control.flags.history.switchedOn' : 'control.flags.history.switchedOff')}
      </Badge>
    );
  }

  return <Badge variant="neutral">{t(`control.flags.history.actions.${change.action}`)}</Badge>;
}
