// Sentry, initialised once at launch: `index.ts` imports this module right
// after the polyfills, so the SDK's handlers are in place before the router
// loads a screen. Without a DSN the SDK is never initialised.
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.15,
  });

  // An error the app logs is one worth reporting: the kit's error boundaries
  // log what they catch with `console.error`, the error among the arguments.
  // It is still logged.
  const logError = console.error;
  console.error = (...args: unknown[]) => {
    const error = args.find((arg) => arg instanceof Error);
    if (error) Sentry.captureException(error);
    logError(...args);
  };
}
