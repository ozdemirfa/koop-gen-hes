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
    <div className="page-header" style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'flex-start', 
      flexWrap: 'wrap', 
      gap: '12px',
      marginBottom: '20px'
    }}>
      <Space direction="vertical" size={0}>
        <Space align="center" size="small">
          {(showBack || onBack || backPath) && (
            <Button 
              type="text" 
              icon={<ArrowLeftOutlined />} 
              onClick={handleBack}
              style={{ 
                marginRight: 4,
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
          )}
          <Title level={3} style={{ margin: 0, fontWeight: 700, fontSize: '20px' }}>{title}</Title>
        </Space>
        {subtitle && (
          <Typography.Text type="secondary" style={{ marginLeft: (showBack || onBack || backPath) ? 36 : 0, fontSize: '13px' }}>
            {subtitle}
          </Typography.Text>
        )}
      </Space>
      {extra && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {extra}
        </div>
      )}
    </div>
  )
}
