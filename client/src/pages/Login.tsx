import React, { useState } from 'react'
import { Card, Form, Input, Button, App, Typography } from 'antd'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/apiError'
import logo from '../assets/logo.png'

const { Title, Text } = Typography

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const { session, signIn } = useAuth()
  const { message } = App.useApp()

  // Session varsa direkt yönlendir, authLoading bekleme (Login sayfasındayız zaten)
  if (session) return <Navigate to="/" replace />

  const onFinish = async (values: { email: string; password: string }) => {
    if (loading) return
    setLoading(true)
    
    try {
      const { error } = await signIn(values.email, values.password)

      if (error) {
        message.error(error.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.')
      } else {
        // Redirection should happen automatically due to session state change
        message.success('Giriş başarılı, yönlendiriliyorsunuz...')
      }
    } catch (err) {
      message.error(getErrorMessage(err, 'Bir hata oluştu. Lütfen tekrar deneyin.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #f0f2f5 0%, #e8eaf6 100%)' }}>
      <Card style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={logo} alt="Logo" style={{ height: 64, marginBottom: 16 }} />
          <Title level={3} style={{ marginBottom: 4 }}>KoopGenHes Yönetim</Title>
          <Text type="secondary">Yönetim paneline giriş yapın</Text>
        </div>

        <Form name="login" onFinish={onFinish} layout="vertical">
          <Form.Item name="email" label="E-posta" rules={[{ required: true, type: 'email', message: 'Lütfen geçerli bir e-posta girin!' }]}>
            <Input size="large" placeholder="ornek@kooperatif.com" />
          </Form.Item>

          <Form.Item name="password" label="Şifre" rules={[{ required: true, message: 'Lütfen şifrenizi girin!' }]}>
            <Input.Password size="large" placeholder="Şifre" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Giriş Yap
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
