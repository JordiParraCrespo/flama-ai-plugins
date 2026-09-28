import { createFileRoute } from '@tanstack/react-router';
import { ApiTokensScreen } from '@/features/api-tokens/screens/api-tokens';

export const Route = createFileRoute('/_authenticated/settings/api-tokens')({
  component: ApiTokensScreen,
});
