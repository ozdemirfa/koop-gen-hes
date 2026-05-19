import React, { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Form, Input, Result, Spin, Typography } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Sprint 20260520-frontend-role-awareness (Faz 3c):
// Davet edilen kullanıcı için şifre belirleme sayfası.
//
// Akış:
//   1. Backend `/api/admin/users/invite` Supabase `auth.admin.inviteUserByEmail`
//      ile davet e-postası gönderir. Magic link `{APP_PUBLIC_URL}/sifre-belirle`
//      hedefine yönlendirir.
//   2. Supabase otomatik olarak URL fragment'taki token'ı parse eder ve session
//      kurar. `onAuthStateChange` event'i `PASSWORD_RECOVERY` veya yeni session
//      ile tetiklenir.
//   3. Kullanıcı yeni şifresini belirleyince `supabase.auth.updateUser({password})`
//      çağrılır, ardından dashboard'a redirect.
//
// Bu sayfa public route'tur (login öncesi erişilebilir) — App.tsx'te
// ProtectedRoute dışında tutulur.

interface FormValues {
  newPassword: string
  confirmPassword: string
}

export const SifreBelirlePage: React.FC = () => {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [success, setSuccess] = useState(false)

  // Supabase davet linkindeki token URL fragment'tan otomatik parse eder.
  // İlk render'da session var mı kontrol et; yoksa onAuthStateChange dinlemeye devam et.
  useEffect(() => {
    let unsub: (() => void) | undefined

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          setHasValidSession(true)
        }
        setSessionLoaded(true)
      })
      .catch(() => setSessionLoaded(true))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasValidSession(true)
        setSessionLoaded(true)
      }
    })
    unsub = () => sub.subscription.unsubscribe()

    return () => unsub?.()
  }, [])

  const handleSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: values.newPassword })
      if (error) {
        message.error(error.message || 'Şifre belirlenemedi')
        return
      }
      message.success('Şifreniz belirlendi. Yönlendiriliyorsunuz...')
      setSuccess(true)
      setTimeout(() => navigate('/'), 1500)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          status="success"
          title="Şifreniz başarıyla belirlendi"
          subTitle="Birkaç saniye içinde panoya yönlendirileceksiniz."
        />
      </div>
    )
  }

  if (!sessionLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!hasValidSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Result
          status="error"
          title="Geçersiz veya süresi dolmuş davet"
          subTitle="Davet bağlantısı geçersiz veya süresi dolmuş. Lütfen bir yönetici ile iletişime geçin."
          extra={
            <Button type="primary" onClick={() => navigate('/login')}>
              Giriş Sayfasına Dön
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          Şifre Belirle
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Hesabınız için bir şifre belirleyin. Şifreniz en az 8 karakter olmalı.
        </Typography.Paragraph>

        <Alert
          type="info"
          showIcon
          message="Davet doğrulandı. Şifrenizi belirleyince otomatik giriş yapılacaksınız."
          style={{ marginBottom: 16 }}
        />

        <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="newPassword"
            label="Yeni Şifre"
            rules={[
              { required: true, message: 'Şifrenizi girin' },
              { min: 8, message: 'Şifre en az 8 karakter olmalı' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Yeni şifre" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Yeni Şifre (Tekrar)"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Şifrenizi tekrar girin' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Şifreler eşleşmiyor'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Yeni şifre (tekrar)" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Şifreyi Belirle ve Giriş Yap
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
