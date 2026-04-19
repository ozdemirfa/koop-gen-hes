import React, { useState } from 'react'
import { Card, Form, Input, Button, App, Typography } from 'antd'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/logo.png'

const { Title } = Typography

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const { session, loading: authLoading, signIn } = useAuth()
  const { message } = App.useApp()

  if (!authLoading && session) return <Navigate to="/" replace />

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true)
    const { error } = await signIn(values.email, values.password)

    if (error) {
      message.error(error.message)
    } else {
      message.success('Giriş başarılı')
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={logo} alt="Logo" style={{ height: 64, marginBottom: 16 }} />
          <Title level={3}>KoopGenHes Yönetim</Title>
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
