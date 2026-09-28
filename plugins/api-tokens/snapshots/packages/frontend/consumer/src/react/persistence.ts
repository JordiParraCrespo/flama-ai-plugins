// flama:begin api-tokens
import { apiTokensKeys } from './api-tokens.queries';
// flama:end api-tokens
import { profileKeys } from './profile.queries';

/**
 * Consumer features that never reach the persisted query cache: a profile is
 * not a thing to leave in a browser's storage. A consumer app passes this to
 * `createQueryPersistOptions`.
 */
export const CONSUMER_NON_PERSISTED_FEATURES: readonly string[] = [
  // flama:begin api-tokens
  // Nor is a list of credentials.
  apiTokensKeys.all[0],
  // flama:end api-tokens
  profileKeys.all[0],
];
