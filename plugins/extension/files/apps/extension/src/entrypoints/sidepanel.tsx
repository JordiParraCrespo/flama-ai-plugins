import { useAuthState } from '@flama/frontend-core/react';
import { useTranslation } from 'react-i18next';
import { SignInScreen } from '@/features/auth/screens/sign-in';
import { SessionGate } from '@/features/auth/sections/session-gate';
import { AccountOverview } from '@/features/profile/sections/account-overview';
import { PageHeader } from '@/features/profile/sections/page-header';
import { mount } from '@/providers/mount';

/**
 * The side panel: the extension's room to work in, open beside any tab for as
 * long as the person wants it. It follows the popup's session without a
 * reload (`session/changed`). An extension built on this base puts its main
 * screen here.
 */
function SidePanel() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthState();

  return (
    <div className="flex min-h-svh flex-col">
      <PageHeader title={t('common.appName')} signedIn={isAuthenticated} />
      <SessionGate
        signedOut={
          <div className="p-6">
            <SignInScreen />
          </div>
        }
      >
        <div className="p-6">
          <AccountOverview />
        </div>
      </SessionGate>
    </div>
  );
}

mount(<SidePanel />);
