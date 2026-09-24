import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagsScreen } from '@/features/feature-flags/screens/feature-flags';

export const Route = createFileRoute('/_authenticated/flags')({
  component: FeatureFlagsScreen,
});
