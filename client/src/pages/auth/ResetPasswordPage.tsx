import React, { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Form, Input, Result, Spin, Typography } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import logo from '../../assets/logo.png'

// Sprint role-system-modernization (PR-E, 2026-05-20):
// "Şifremi Unuttum" akışının ikinci ayağı — e-postadan gelen recovery linki
// tıklandığında bu sayfa açılır.
//
// Akış:
//   1. ForgotPasswordPage `supabase.auth.resetPasswordForEmail(email, {redirectTo})`
//      çağırır. Redirect URL bu sayfayı işaret eder.
//   2. Supabase recovery e-postası şu formatta link içerir:
//        {redirectTo}#access_token=...&type=recovery&refresh_token=...
//   3. supabase-js URL hash fragment'ı otomatik parse eder ve geçici bir
//      recovery session kurar. `onAuthStateChange` event'i `PASSWORD_RECOVERY`
//      tipi ile tetiklenir.
//   4. Bu session yetkileri sınırlıdır — sadece `updateUser({password})` izinli.
//   5. Şifre güncellendikten sonra session normal kullanıcı session'ı olur ve
//      login'e yönlendiriyoruz (tutarlılık için — recovery hash kalmasın).
//
// Bu sayfa public route'tur — App.tsx içinde ProtectedRoute dışında tutulur.

const { Title, Paragraph } = Typography

interface FormValues {
  newPassword: string
  confirmPassword: string
}

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [success, setSuccess] = useState(false)

  // Supabase recovery linkindeki token URL fragment'tan otomatik parse edilir.
  // İlk render'da session var mı kontrol et; yoksa onAuthStateChange dinlemeye devam et.
  // SifreBelirlePage ile aynı yapı — iki akış da updateUser({password}) ile biter,
  // tek fark UI/copy.
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          setHasValidSession(true)
        }
        setSessionLoaded(true)
      })
      .catch(() => setSessionLoaded(true))

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY event'i recovery linki tıklandığında özel olarak gelir.
      // SIGNED_IN de aynı session kurulumuyla tetiklenebilir; ikisini de kabul ediyoruz.
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setHasValidSession(true)
        setSessionLoaded(true)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: values.newPassword })
      if (error) {
        message.error(error.message || 'Şifre güncellenemedi.')
        return
      }
      message.success('Şifreniz başarıyla güncellendi.')
      setSuccess(true)

      // Recovery hash'i URL'de kalmasın diye signOut + login'e yönlendir.
      // Kullanıcı yeni şifreyle bilinçli giriş yapsın — UX olarak da net.
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login'), 1500)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          status="success"
          title="Şifreniz başarıyla güncellendi"
          subTitle="Giriş sayfasına yönlendiriliyorsunuz. Yeni şifrenizle oturum açabilirsiniz."
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
          title="Geçersiz veya süresi dolmuş bağlantı"
          subTitle="Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeniden bağlantı talep edin."
          extra={
            <>
              <Link to="/auth/sifremi-unuttum">
                <Button type="primary">Yeni Bağlantı Talep Et</Button>
              </Link>
              <Link to="/login" style={{ marginLeft: 8 }}>
                <Button>Giriş Sayfası</Button>
              </Link>
            </>
          }
        />
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'linear-gradient(135deg, #f0f2f5 0%, #e8eaf6 100%)',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 480, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={logo} alt="Logo" style={{ height: 64, marginBottom: 16 }} />
          <Title level={3} style={{ marginBottom: 4 }}>
            Yeni Şifre Belirle
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Lütfen yeni şifrenizi belirleyin.
          </Paragraph>
        </div>

        <Alert
          type="info"
          showIcon
          message="Bağlantı doğrulandı. Şifreniz güncellendikten sonra giriş yapabilirsiniz."
          style={{ marginBottom: 16 }}
        />

        <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="newPassword"
            label="Yeni Şifre"
            rules={[
              { required: true, message: 'Şifrenizi girin.' },
              { min: 8, message: 'Şifre en az 8 karakter olmalı.' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Yeni şifre" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Yeni Şifre (Tekrar)"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Şifrenizi tekrar girin.' },
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
