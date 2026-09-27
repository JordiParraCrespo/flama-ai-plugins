// RevenueCat, configured once per launch by importing this module
// (`@flama/frontend-mobile/purchases`, from the root layout). Keys are per
// store; without one for this platform the SDK is never configured.
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string;
      EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string;
    }
  }
}

const apiKey =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

if (apiKey) {
  try {
    Purchases.configure({ apiKey });
  } catch {
    // Missing store setup must not take the app down.
  }
}
