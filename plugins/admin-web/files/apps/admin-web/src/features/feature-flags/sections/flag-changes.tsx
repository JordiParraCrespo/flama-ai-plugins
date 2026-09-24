import { History } from '@flama/design-system-web/icons';
import { useFlagChanges } from '@flama/frontend-admin/react';
import { DataTable, useTableQuery } from '@flama/frontend-web';
import { useTranslation } from 'react-i18next';
import { useChangeColumns } from '@/features/feature-flags/hooks/use-change-columns';

const PAGE_SIZE = 20;

/**
 * The audit trail: every change to any flag or segment, newest first.
 *
 * The search box is a key filter the API answers — `subjectKey` on
 * `GET /v1/feature-flags/changes` — so a page of history is always the
 * server's page, never a browser-side slice of one.
 */
export function FlagChanges() {
  const { t } = useTranslation();
  const query = useTableQuery({ prefix: 'history' });
  const { search, page } = query;
  const changes = useFlagChanges({
    subjectKey: search || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const meta = changes.data?.meta;
  const columns = useChangeColumns();

  return (
    <DataTable
      columns={columns}
      rows={changes.data?.data ?? []}
      getKey={(change) => change.id}
      isLoading={changes.isLoading}
      isFetching={changes.isFetching}
      emptyLabel={t('control.flags.history.empty')}
      emptyIcon={<History />}
      search={{
        value: search,
        onChange: query.setSearch,
        placeholder: t('control.flags.history.search'),
      }}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
        onPageChange: query.setPage,
      }}
    />
  );
}
