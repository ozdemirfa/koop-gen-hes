import React from 'react'
import { Typography, Space, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'

const { Title } = Typography

interface PageHeaderProps {
  title: string
  subtitle?: string
  showBack?: boolean
  backPath?: string
  onBack?: () => void
  extra?: React.ReactNode
}

export const PageHeader: React.FC<PageHeaderProps> = ({ 
  title, 
  subtitle,
  showBack = false, 
  backPath, 
  onBack,
  extra 
}) => {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) return onBack()
    if (backPath) return navigate(backPath)
    navigate(-1)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <Space direction="vertical" size={0}>
        <Space align="center" size="middle">
          {(showBack || onBack || backPath) && (
            <Button 
              type="text" 
              icon={<ArrowLeftOutlined />} 
              onClick={handleBack} 
            />
          )}
          <Title level={3} style={{ margin: 0 }}>{title}</Title>
        </Space>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </Space>
      {extra && <Space>{extra}</Space>}
    </div>
  )
}
