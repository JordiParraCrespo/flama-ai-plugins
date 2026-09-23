import { DropdownMenuItem, DropdownMenuSeparator } from '@flama/design-system-web';
import { Plus, Trash2, Users } from '@flama/design-system-web/icons';
import type { FlagSegment } from '@flama/frontend-admin';
import { useFlagSegments } from '@flama/frontend-admin/react';
import { DataTable, paginateRows, useTableQuery } from '@flama/frontend-web';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeleteSegmentDialog } from '@/features/feature-flags/dialogs/delete-segment';
import { SegmentEditorDialog } from '@/features/feature-flags/dialogs/segment-editor';
import { useSegmentColumns } from '@/features/feature-flags/hooks/use-segment-columns';

const PAGE_SIZE = 10;

/** The named audiences flag rules target, and which flags target each. */
export function SegmentsTable() {
  const { t } = useTranslation();
  const query = useTableQuery({ prefix: 'segments' });
  const segments = useFlagSegments();
  const [editor, setEditor] = useState<{ segment?: FlagSegment } | null>(null);
  const [deleting, setDeleting] = useState<FlagSegment | null>(null);
  const columns = useSegmentColumns();
  const { rows, pagination } = paginateRows(segments.data ?? [], PAGE_SIZE, query);

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getKey={(segment) => segment.key}
        isLoading={segments.isLoading}
        isFetching={segments.isFetching}
        emptyLabel={t('control.flags.segments.empty')}
        emptyIcon={<Users />}
        pagination={pagination}
        addAction={{
          label: t('control.flags.segments.new'),
          icon: <Plus />,
          onClick: () => setEditor({}),
        }}
        rowActions={(segment) => (
          <>
            <DropdownMenuItem onClick={() => setEditor({ segment })}>
              {t('control.flags.segments.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(segment)}>
              <Trash2 />
              {t('control.flags.segments.delete')}
            </DropdownMenuItem>
          </>
        )}
      />

      {editor && (
        <SegmentEditorDialog
          key={editor.segment?.key ?? 'new'}
          segment={editor.segment}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && <DeleteSegmentDialog segment={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
