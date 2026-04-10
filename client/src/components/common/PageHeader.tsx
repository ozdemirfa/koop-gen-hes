import React from 'react'
import { Typography, Space, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'

const { Title } = Typography

interface PageHeaderProps {
  title: string
  showBack?: boolean
  backPath?: string
  extra?: React.ReactNode
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, showBack = false, backPath, extra }) => {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <Space align="center" size="middle">
        {showBack && (
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />} 
            onClick={() => backPath ? navigate(backPath) : navigate(-1)} 
          />
        )}
        <Title level={3} style={{ margin: 0 }}>{title}</Title>
      </Space>
      {extra && <Space>{extra}</Space>}
    </div>
  )
}
