import { isTwoFactorRequired, useErrorMessage, useLogin } from '@flama/frontend-core/react';
import {
  AuthLayout,
  AuthLink,
  AuthSubtitle,
  AuthTitle,
  LoginForm,
  SocialLoginButtons,
  TwoFactorChallenge,
} from '@flama/frontend-mobile';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const resolveError = useErrorMessage();
  const { mutate, isPending, error, reset } = useLogin();

  const toApp = () => router.replace('/(app)');

  // The password was right and the account has two-factor on: the sign-in
  // owes a code. Derived from the mutation, so "back" is forgetting it.
  if (isTwoFactorRequired(error)) {
    return (
      <AuthLayout brandLabel={t('common.controlAppName')}>
        <TwoFactorChallenge onSuccess={toApp} onCancel={reset} />
      </AuthLayout>
    );
  }

  // No sign-up footer and no `sign-up` intent anywhere on this screen: the
  // control plane has no public registration, so an account here is one an
  // existing platform administrator provisioned.
  return (
    <AuthLayout brandLabel={t('common.controlAppName')}>
      <AuthTitle>{t('auth.login.title')}</AuthTitle>
      <AuthSubtitle>{t('auth.login.description')}</AuthSubtitle>

      <LoginForm
        isPending={isPending}
        error={error ? resolveError(error, t('auth.login.invalidCredentials')).message : undefined}
        forgotPasswordLink={
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable>
              <AuthLink>{t('auth.login.forgotPassword')}</AuthLink>
            </Pressable>
          </Link>
        }
        onSubmit={(values) => mutate(values, { onSuccess: toApp })}
      />

      <SocialLoginButtons disabled={isPending} onSuccess={toApp} />
    </AuthLayout>
  );
}
