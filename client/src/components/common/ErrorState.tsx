import React from 'react'
import { Result, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

interface Props {
  error: unknown
  onRetry?: () => void
  title?: string
}

const getErrorMessage = (error: unknown): string => {
  if (!error) return 'Bilinmeyen bir hata oluştu'
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const e = error as Record<string, any>
    return e.error || e.message || e.msg || 'Bir hata oluştu'
  }
  return 'Bir hata oluştu'
}

export const ErrorState: React.FC<Props> = ({ error, onRetry, title = 'Bir sorun oluştu' }) => (
  <Result
    status="error"
    title={title}
    subTitle={getErrorMessage(error)}
    extra={
      onRetry ? (
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          Tekrar dene
        </Button>
      ) : undefined
    }
  />
)
