import { Tabs, TabsContent, TabsList, TabsTrigger } from '@flama/design-system-web';
import { PageHead } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';
import { FlagChanges } from '@/features/feature-flags/sections/flag-changes';
import { FlagsTable } from '@/features/feature-flags/sections/flags-table';
import { SegmentsTable } from '@/features/feature-flags/sections/segments-table';

/**
 * Operating feature flags. The screen composes: each tab is a section that
 * owns its own query, so switching a flag off refetches the flags and the
 * history without the segments table noticing.
 */
export function FeatureFlagsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <PageHead title={t('control.flags.title')} sub={t('control.flags.description')} />
      <Tabs defaultValue="flags">
        <TabsList>
          <TabsTrigger value="flags">{t('control.flags.tabs.flags')}</TabsTrigger>
          <TabsTrigger value="segments">{t('control.flags.tabs.segments')}</TabsTrigger>
          <TabsTrigger value="history">{t('control.flags.tabs.history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="flags">
          <FlagsTable />
        </TabsContent>
        <TabsContent value="segments">
          <SegmentsTable />
        </TabsContent>
        <TabsContent value="history">
          <FlagChanges />
        </TabsContent>
      </Tabs>
    </>
  );
}
