import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Skeleton,
} from '@flama/design-system-web';
import { useMyProfile } from '@flama/frontend-consumer/react';
import { useTranslation } from 'react-i18next';
import { apiBaseUrl } from '@/lib/auth-client';

/**
 * The signed-in account, as the API returns it: the proof that sign-in is
 * wired end to end. `GET /api/v1/profile` goes out with the session cookie the
 * sign-in set, through the same kernel and product package the web app uses.
 * An extension built on this base replaces this pane with its own feature and
 * keeps everything under it.
 */
export function AccountOverview() {
  const { t } = useTranslation();
  const profile = useMyProfile();
  const host = new URL(apiBaseUrl).host;

  if (profile.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('extension.account.loadError')}</AlertDescription>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-fit"
          disabled={profile.isFetching}
          onClick={() => profile.refetch()}
        >
          {t('extension.account.retry')}
        </Button>
      </Alert>
    );
  }

  const user = profile.data;

  return (
    <section
      aria-label={t('extension.account.title')}
      className="flex flex-col items-center gap-3 text-center"
    >
      <Avatar size="lg">
        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
        <AvatarFallback>{user?.initials ?? ''}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col items-center gap-1">
        {user ? (
          <>
            <p className="max-w-full truncate text-base font-medium text-ink-900">
              {user.fullName}
            </p>
            <p className="max-w-full truncate text-sm text-ink-600">{user.email}</p>
          </>
        ) : (
          <>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-44" />
          </>
        )}
      </div>
      <p className="text-xs text-ink-400">{t('extension.account.connectedTo', { host })}</p>
    </section>
  );
}
