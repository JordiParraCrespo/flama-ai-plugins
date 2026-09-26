import { AuthRequestError, unwrap } from '@flama/auth/client';
import { type UseMutationOptions, useMutation } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';

/** The user's answer to an OAuth client's consent request. */
export interface ConsentAnswer {
  consentCode: string;
  accept: boolean;
}

/**
 * Answer an OAuth client's consent request. Resolves with the redirect URI the
 * caller hands the browser to; nothing in the cache changes, since the grant is
 * the OAuth client's, not this app's.
 *
 * Through the Better Auth client rather than a bare `fetch`, so the call goes
 * to the same `baseURL` (and `VITE_API_URL`) as every sign-in does.
 */
export function useRespondToConsent(
  options?: Omit<UseMutationOptions<string, Error, ConsentAnswer>, 'mutationFn'>,
) {
  return useMutation({
    mutationFn: async ({ consentCode, accept }: ConsentAnswer) => {
      const result = await authClient.$fetch<{ redirectURI?: string }>('/oauth2/consent', {
        method: 'POST',
        body: { accept, consent_code: consentCode },
      });
      unwrap(result);
      if (!result.data?.redirectURI) {
        throw new AuthRequestError({ code: 'OAUTH_CONSENT_NO_REDIRECT' });
      }
      return result.data.redirectURI;
    },
    ...options,
  });
}
