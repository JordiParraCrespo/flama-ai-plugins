import { Button, Kbd } from '@flama/design-system-web';
import { Trans, useTranslation } from 'react-i18next';
import { SettingsCard } from '@/features/user-settings/components/settings-card';
import { useOpenShortcut } from '@/features/user-settings/hooks/use-open-shortcut';
import { LINKS } from '@/lib/nav';

/** The shortcut that opens the extension, as Chrome has it bound, and where to change it. */
export function Shortcuts() {
  const { t } = useTranslation();
  const open = useOpenShortcut();

  return (
    <SettingsCard
      title={t('extension.options.shortcutsTitle')}
      description={
        <Trans
          i18nKey="extension.options.shortcutsDescription"
          values={{ open: open || '—' }}
          components={{ kbd: <Kbd /> }}
        />
      }
    >
      <Button variant="secondary" size="sm" onClick={() => void LINKS.shortcuts()}>
        {t('extension.options.manageShortcuts')}
      </Button>
    </SettingsCard>
  );
}
