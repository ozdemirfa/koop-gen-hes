/**
 * Yetkili davet modal — sadece admin kullanır.
 * POST /api/admin/invitations/yetkili { email }
 *
 * Proje seçimi yok; global yetkili rolü için.
 */

import React from 'react'
import { App, Form, Input, Modal } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { invitationsApi } from '../lib/invitationsApi'
import { getErrorMessage } from '../lib/apiError'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormValues {
  email: string
}

export const YetkiliInviteModal: React.FC<Props> = ({ open, onClose }) => {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => invitationsApi.createYetkiliInvitation(values.email),
    onSuccess: () => {
      message.success('Davet gönderildi, e-posta kontrol edin')
      form.resetFields()
      onClose()
    },
    onError: (err: any) => {
      const status = err?.response?.status
      if (status === 409) {
        message.error('Bu e-posta için bekleyen bir yetkili daveti zaten var.')
      } else {
        message.error(getErrorMessage(err, 'Davet gönderilemedi'))
      }
    },
  })

  const handleOk = async () => {
    const values = await form.validateFields()
    mutation.mutate(values)
  }

  const handleCancel = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title="Yetkili Davet Et"
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      okText="Davet Gönder"
      cancelText="Vazgeç"
      confirmLoading={mutation.isPending}
      destroyOnClose
      width={480}
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          label="E-posta"
          name="email"
          rules={[
            { required: true, message: 'E-posta zorunlu' },
            { type: 'email', message: 'Geçerli bir e-posta girin' },
          ]}
        >
          <Input
            prefix={<MailOutlined />}
            placeholder="yetkili@firma.com"
            autoComplete="off"
          />
        </Form.Item>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
          Davet edilen kişi bu e-posta ile sisteme <strong>Yetkili</strong> rolüyle kayıt olacaktır
          ve yeni proje oluşturabilecektir.
        </p>
      </Form>
    </Modal>
  )
}
