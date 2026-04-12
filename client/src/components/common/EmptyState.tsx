import React from 'react'
import { Empty } from 'antd'

interface Props {
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<Props> = ({
  description = 'Kayıt bulunamadı',
  action,
}) => (
  <Empty
    image={Empty.PRESENTED_IMAGE_SIMPLE}
    description={description}
    style={{ padding: '32px 0' }}
  >
    {action}
  </Empty>
)
