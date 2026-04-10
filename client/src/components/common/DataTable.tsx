import React from 'react'
import { Table, Card } from 'antd'
import type { TableProps } from 'antd'

interface DataTableProps<T> extends TableProps<T> {
  totalItems?: number
  hideCard?: boolean
}

export function DataTable<T extends object>({ 
  totalItems, 
  hideCard = false, 
  pagination, 
  ...tableProps 
}: DataTableProps<T>) {
  
  const mergedPagination = pagination !== false ? {
    pageSize: 20,
    total: totalItems,
    showTotal: (total: number) => `Toplam ${total} kayıt`,
    ...pagination,
  } : false;

  const tableContent = (
    <Table<T>
      {...tableProps}
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
