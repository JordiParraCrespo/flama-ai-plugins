import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from '@flama/design-system-web';
import { useLogout, useProfile } from '@flama/frontend-core/react';
import { AppShell, BrandGlyph, redirectSignedOut } from '@flama/frontend-web';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { NAV } from '@/lib/nav';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => redirectSignedOut({ context, location }),
  component: ControlPlaneGate,
});

function ControlPlaneGate() {
  const profile = useProfile();

  if (profile.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <Skeleton className="h-32 w-full max-w-md rounded-2xl" />
      </div>
    );
  }

  // A profile that failed to load is not a profile that says no. Telling an
  // authorized administrator they lack permission, and offering only logout,
  // is the wrong answer to an unreachable API — the session-restore path
  // already treats a network failure as retryable.
  if (profile.isError) return <ProfileUnavailable retry={() => profile.refetch()} />;

  if (!profile.data?.canAccessControlPlane) return <AccessDenied />;
  return <AuthenticatedLayout />;
}

function ProfileUnavailable({ retry }: { retry: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Alert className="max-w-md">
        <AlertTitle>{t('auth.session.errorTitle')}</AlertTitle>
        <AlertDescription>{t('auth.session.errorMessage')}</AlertDescription>
        <Button variant="secondary" size="sm" className="mt-4" onClick={retry}>
          {t('auth.session.retry')}
        </Button>
      </Alert>
    </div>
  );
}

function AccessDenied() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout({ onSuccess: () => navigate({ to: '/login' }) });

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Alert variant="destructive" className="max-w-md">
        <AlertTitle>{t('control.accessDeniedTitle')}</AlertTitle>
        <AlertDescription>{t('control.accessDeniedDescription')}</AlertDescription>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {t('nav.logOut')}
        </Button>
      </Alert>
    </div>
  );
}

function AuthenticatedLayout() {
  return (
    <AppShell nav={NAV} workspace={{ name: 'Flama Control', icon: <BrandGlyph /> }}>
      <Outlet />
    </AppShell>
  );
}
