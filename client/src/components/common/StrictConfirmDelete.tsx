import React, { useState } from 'react'
import { Modal, Input, Button, Typography, Space, message } from 'antd'
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'

const { Text, Title } = Typography

interface StrictConfirmDeleteProps {
  title: string
  confirmText: string
  onConfirm: () => void
  buttonIcon?: React.ReactNode
  buttonType?: "text" | "link" | "default" | "primary" | "dashed"
  loading?: boolean
}

export const StrictConfirmDelete: React.FC<StrictConfirmDeleteProps> = ({
  title,
  confirmText,
  onConfirm,
  buttonIcon = <DeleteOutlined />,
  buttonType = "text",
  loading = false,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const showModal = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsModalVisible(true)
  }

  const handleCancel = () => {
    setIsModalVisible(false)
    setInputValue('')
  }

  const handleConfirm = () => {
    if (inputValue !== confirmText) {
      message.error('Girdiğiniz metin eşleşmiyor!')
      return
    }
    onConfirm()
    setIsModalVisible(false)
    setInputValue('')
  }

  return (
    <>
      <Button
        danger
        icon={buttonIcon}
        type={buttonType}
        onClick={showModal}
      />
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            <Text strong>Silme İşlemini Onayla</Text>
          </Space>
        }
        open={isModalVisible}
        onOk={handleConfirm}
        onCancel={handleCancel}
        okText="Kalıcı Olarak Sil"
        cancelText="Vazgeç"
        okButtonProps={{ danger: true, disabled: inputValue !== confirmText, loading }}
        width="min(450px, 95vw)"
        centered
        style={{ top: -100 }} // Biraz daha yukarıda göster
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Text>{title}</Text>
          <div style={{ background: '#fff1f0', padding: '12px', borderRadius: '4px', border: '1px solid #ffa39e' }}>
            <Text type="danger" strong>Dikkat:</Text>
            <br />
            <Text type="secondary">Bu işlem geri alınamaz. Devam etmek için lütfen aşağıdaki kutuya tam olarak <Text strong>"{confirmText}"</Text> yazın.</Text>
          </div>
          <Input
            placeholder={confirmText}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={inputValue === confirmText ? handleConfirm : undefined}
          />
        </Space>
      </Modal>
    </>
  )
}
