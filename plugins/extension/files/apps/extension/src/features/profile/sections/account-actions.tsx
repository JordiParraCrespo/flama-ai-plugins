import { Button } from '@flama/design-system-web';
import { useTranslation } from 'react-i18next';
import { useCurrentWindow } from '@/features/profile/hooks/use-current-window';
import { MENU } from '@/lib/nav';

/** The popup's way onward: the destinations in `lib/nav.ts`, as buttons. */
export function AccountActions() {
  const { t } = useTranslation();
  const windowId = useCurrentWindow();

  return (
    <div className="flex flex-col gap-2">
      {MENU.map((item, index) => (
        <Button
          key={item.labelKey}
          variant={index === 0 ? 'default' : 'secondary'}
          className="h-10 w-full"
          disabled={windowId === undefined}
          onClick={() => windowId !== undefined && void item.go(windowId)}
        >
          <item.icon className="size-4" />
          {t(`extension.nav.${item.labelKey}`)}
        </Button>
      ))}
    </div>
  );
}
