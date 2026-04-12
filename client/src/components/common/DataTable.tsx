import React from 'react'
import { Table, Card } from 'antd'
import type { TableProps } from 'antd'
import { EmptyState } from './EmptyState'

interface DataTableProps<T> extends TableProps<T> {
  totalItems?: number
  hideCard?: boolean
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

export function DataTable<T extends object>({
  totalItems,
  hideCard = false,
  pagination,
  emptyDescription,
  emptyAction,
  locale,
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

  const tableContent = (
    <Table<T>
      {...tableProps}
      locale={mergedLocale}
      pagination={mergedPagination}
      scroll={{ x: 'max-content' }}
    />
  )

  if (hideCard) return tableContent

  return (
    <Card styles={{ body: { padding: 0 } }}>
      {tableContent}
    </Card>
  )
}
