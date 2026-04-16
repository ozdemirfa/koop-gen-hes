import React from 'react'
import { Popconfirm, Button, type PopconfirmProps } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'

interface ConfirmDeleteProps extends Omit<PopconfirmProps, 'title'> {
  title?: string
  buttonText?: string
  buttonType?: "text" | "link" | "default" | "primary" | "dashed"
  danger?: boolean
  size?: 'small' | 'middle' | 'large'
}

export const ConfirmDelete: React.FC<ConfirmDeleteProps> = ({ 
  title = "Silmek istediğinize emin misiniz?", 
  buttonText, 
  buttonType = "text", 
  danger = true,
  size,
  ...props 
}) => {
  return (
    <Popconfirm title={title} placement="topRight" {...props}>
      <Button 
        danger={danger} 
        icon={<DeleteOutlined />} 
        type={buttonType}
        size={size}
      >
        {buttonText}
      </Button>
    </Popconfirm>
  )
}
