import React, { useState } from 'react'
import { Card, Form, Input, Button, App, Typography, Alert } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePageSettings } from '../../contexts/LayoutContext'

interface FormValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export const SifreDegistirPage: React.FC = () => {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  usePageSettings('Şifre Değiştir')

  const handleSubmit = async (values: FormValues) => {
    if (!user?.email) {
      message.error('Oturum bilgisi okunamadı. Lütfen yeniden giriş yapın.')
      return
    }

    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: values.currentPassword,
      })
      if (authError) {
        message.error('Mevcut şifre hatalı.')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: values.newPassword,
      })
      if (updateError) {
        message.error(updateError.message || 'Şifre güncellenemedi.')
        return
      }

      message.success('Şifreniz başarıyla güncellendi.')
      form.resetFields()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '24px auto', padding: '0 16px' }}>
      <Card>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Hesabınız: <strong>{user?.email}</strong>
        </Typography.Paragraph>

        <Alert
          type="info"
          showIcon
          message="Yeni şifreniz en az 8 karakter olmalıdır."
          style={{ marginBottom: 16 }}
        />

        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="currentPassword"
            label="Mevcut Şifre"
            rules={[{ required: true, message: 'Mevcut şifrenizi girin.' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Mevcut şifre"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="Yeni Şifre"
            rules={[
              { required: true, message: 'Yeni şifrenizi girin.' },
              { min: 8, message: 'Şifre en az 8 karakter olmalı.' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Yeni şifre"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Yeni Şifre (Tekrar)"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Yeni şifrenizi tekrar girin.' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Şifreler eşleşmiyor.'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Yeni şifre (tekrar)"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Şifreyi Güncelle
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
