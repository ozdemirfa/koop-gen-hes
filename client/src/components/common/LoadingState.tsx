import React from 'react'
import { Spin } from 'antd'

interface Props {
  fullHeight?: boolean
  tip?: string
}

export const LoadingState: React.FC<Props> = ({ fullHeight = false, tip }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: fullHeight ? '80px 20px' : '40px 20px',
      minHeight: fullHeight ? 320 : undefined,
    }}
  >
    <Spin size="large" tip={tip} />
  </div>
)
