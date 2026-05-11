import React from 'react'
import { Table, Card } from 'antd'
import type { TableProps, ColumnType } from 'antd/es/table'
import { EmptyState } from './EmptyState'

interface DataTableProps<T> extends TableProps<T> {
  totalItems?: number
  hideCard?: boolean
  emptyDescription?: string
  emptyAction?: React.ReactNode
  /**
   * A2-03 (2026-05-11): İlk kolonu mobile horizontal scroll'da sabit (sticky) yap.
   * `columns[0]`'a otomatik `fixed: 'left'` enjekte eder. Tablo geniş kolonlu
   * (Üye/Cari adı gibi anchor kolonlu) listelerde mobile ergonomyi için.
   */
  stickyFirstColumn?: boolean
}

export function DataTable<T extends object>({
  totalItems,
  hideCard = false,
  pagination,
  emptyDescription,
  emptyAction,
  locale,
  columns,
  stickyFirstColumn = false,
  ...tableProps
}: DataTableProps<T>) {

  const mergedPagination = pagination !== false ? {
    pageSize: 20,
    total: totalItems,
    showTotal: (total: number) => `Toplam ${total} kayıt`,
    ...pagination,
  } : false;

  const mergedLocale = {
    emptyText: <EmptyState description={emptyDescription} action={emptyAction} />,
    ...locale,
  }

  // A2-03: stickyFirstColumn aktifse ilk kolona fixed: 'left' enjekte et.
  // Kullanıcı zaten manuel fixed verdiyse override etmiyoruz.
  const finalColumns = React.useMemo(() => {
    if (!columns || !stickyFirstColumn || columns.length === 0) return columns
    const first = columns[0] as ColumnType<T>
    if (first.fixed) return columns // already explicit
    const patched: ColumnType<T> = { ...first, fixed: 'left' as const }
    return [patched, ...columns.slice(1)]
  }, [columns, stickyFirstColumn])

  const tableContent = (
    <Table<T>
      {...tableProps}
      columns={finalColumns}
      locale={mergedLocale}
      pagination={mergedPagination}
      scroll={{ x: 'max-content' }}
      bordered={false}
      style={{
        borderRadius: 8,
        overflow: 'hidden'
      }}
    />
  )

  if (hideCard) return tableContent

  return (
    <Card
      styles={{ body: { padding: 0 } }}
      style={{
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-color)'
      }}
    >
      {tableContent}
    </Card>
  )
}
