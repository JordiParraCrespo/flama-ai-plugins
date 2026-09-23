import { DropdownMenuItem } from '@flama/design-system-web';
import { Flag } from '@flama/design-system-web/icons';
import type { FeatureFlag } from '@flama/frontend-admin';
import { useManagedFeatureFlags } from '@flama/frontend-admin/react';
import { DataTable, paginateRows, useTableQuery } from '@flama/frontend-web';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExplainFlagDialog } from '@/features/feature-flags/dialogs/explain-flag';
import { FlagHistoryDialog } from '@/features/feature-flags/dialogs/flag-history';
import { TargetingEditorDialog } from '@/features/feature-flags/dialogs/targeting-editor';
import { ToggleFlagDialog } from '@/features/feature-flags/dialogs/toggle-flag';
import { useFlagColumns } from '@/features/feature-flags/hooks/use-flag-columns';

const PAGE_SIZE = 10;

type OpenDialog =
  | { kind: 'toggle'; flag: FeatureFlag; enabled: boolean }
  | { kind: 'edit' | 'explain' | 'history'; flag: FeatureFlag };

/**
 * Every flag the code declares, what it is serving, and its switch.
 *
 * The API hands the catalog over whole — it is as long as the code is, not as
 * long as the workspace — so it is paged here with the kit's `paginateRows`
 * and has no search box to answer in the browser.
 *
 * The dialogs are held here rather than by the row that opens them: row
 * actions render inside the overflow popup and would unmount with it.
 */
export function FlagsTable() {
  const { t } = useTranslation();
  const query = useTableQuery({ prefix: 'flags' });
  const flags = useManagedFeatureFlags();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const columns = useFlagColumns((flag, enabled) => setDialog({ kind: 'toggle', flag, enabled }));
  const { rows, pagination } = paginateRows(flags.data ?? [], PAGE_SIZE, query);

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getKey={(flag) => flag.key}
        isLoading={flags.isLoading}
        isFetching={flags.isFetching}
        emptyLabel={t('control.flags.empty')}
        emptyIcon={<Flag />}
        pagination={pagination}
        rowActions={(flag) => (
          <>
            <DropdownMenuItem onClick={() => setDialog({ kind: 'edit', flag })}>
              {t('control.flags.actions.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog({ kind: 'explain', flag })}>
              {t('control.flags.actions.explain')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog({ kind: 'history', flag })}>
              {t('control.flags.actions.history')}
            </DropdownMenuItem>
          </>
        )}
      />

      {dialog?.kind === 'toggle' && (
        <ToggleFlagDialog
          flag={dialog.flag}
          enabled={dialog.enabled}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'edit' && (
        <TargetingEditorDialog flag={dialog.flag} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'explain' && (
        <ExplainFlagDialog flag={dialog.flag} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'history' && (
        <FlagHistoryDialog flag={dialog.flag} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
