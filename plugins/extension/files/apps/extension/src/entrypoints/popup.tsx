import { useAuthState } from '@flama/frontend-core/react';
import { useTranslation } from 'react-i18next';
import { SignInScreen } from '@/features/auth/screens/sign-in';
import { SessionGate } from '@/features/auth/sections/session-gate';
import { AccountActions } from '@/features/profile/sections/account-actions';
import { AccountOverview } from '@/features/profile/sections/account-overview';
import { PageHeader } from '@/features/profile/sections/page-header';
import { mount } from '@/providers/mount';

/**
 * The toolbar popup, opened by the toolbar button or Alt+Shift+F and closed the
 * moment it loses focus. Signed out it is the sign-in; signed in, the account
 * and the way onward. An extension built on this base puts its one quick action
 * here, and anything longer in the side panel.
 */
function Popup() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthState();

  return (
    <>
      <PageHeader title={t('common.appName')} signedIn={isAuthenticated} />
      <SessionGate
        signedOut={
          <div className="p-5">
            <SignInScreen />
          </div>
        }
      >
        <div className="flex flex-col gap-5 p-5">
          <AccountOverview />
          <AccountActions />
        </div>
      </SessionGate>
    </>
  );
}

mount(<Popup />);
