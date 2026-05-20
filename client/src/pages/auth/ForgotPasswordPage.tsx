import React, { useState } from 'react'
import { Alert, App, Button, Card, Form, Input, Result, Typography } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import logo from '../../assets/logo.png'

// Sprint role-system-modernization (PR-E, 2026-05-20):
// "Şifremi Unuttum" akışı — e-mail tabanlı self şifre reset.
//
// Akış:
//   1. Kullanıcı e-postasını girer.
//   2. `supabase.auth.resetPasswordForEmail` çağrısı yapılır. Supabase, hesap
//      varsa otomatik olarak "Reset Password" şablonunu gönderir; hesap yoksa
//      sessizce hata vermez (kullanıcı varlığını sızdırmamak için aynı başarı
//      mesajı gösterilir).
//   3. E-postadaki link `{redirectTo}` adresine yönlendirir. Hash fragment'ta
//      `access_token` + `type=recovery` parametreleri gelir.
//   4. ResetPasswordPage bu token'la `supabase.auth.updateUser({password})`
//      çağrısı yapar.
//
// Bu sayfa public route'tur — App.tsx içinde ProtectedRoute dışında tutulur.

const { Title, Text, Paragraph } = Typography

interface FormValues {
  email: string
}

export const ForgotPasswordPage: React.FC = () => {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (values: FormValues) => {
    if (loading) return
    setLoading(true)

    try {
      // Recovery linki bu adrese yönlendirir. window.location.origin sayesinde
      // dev/prod ayrımı yapmadan çalışır. Supabase Dashboard → URL Configuration
      // altında bu adresin "Redirect URLs" listesinde olması gerekir.
      const redirectTo = `${window.location.origin}/auth/sifre-sifirla`

      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo,
      })

      if (error) {
        // Supabase rate limit (HTTP 429) ya da geçerli olmayan e-mail formatı
        // dışındaki hatalar nadirdir. Kullanıcı varlığını sızdırmamak için
        // sadece rate-limit'i ayrı mesajla bildiriyoruz; diğer durumlarda
        // "kayıtlıysa gönderildi" mesajı veriyoruz.
        const status = (error as { status?: number }).status
        if (status === 429) {
          message.warning('Çok fazla deneme. Lütfen birkaç dakika sonra tekrar deneyin.')
          return
        }
        // Beklenmeyen hatayı logla ama kullanıcıya yine başarı göster.
        console.error('[ForgotPassword] resetPasswordForEmail error:', error)
      }

      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f0f2f5 0%, #e8eaf6 100%)',
        padding: 16,
      }}
    >
      <Card style={{ width: 420, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={logo} alt="Logo" style={{ height: 64, marginBottom: 16 }} />
          <Title level={3} style={{ marginBottom: 4 }}>
            Şifremi Unuttum
          </Title>
          <Text type="secondary">Hesabınıza bağlı e-posta adresinizi girin</Text>
        </div>

        {submitted ? (
          <Result
            status="success"
            title="Bağlantı gönderildi"
            subTitle={
              <>
                Eğer bu e-posta sistemde kayıtlıysa, şifre sıfırlama bağlantısı
                gönderildi. Lütfen gelen kutunuzu (ve gerekirse spam klasörünü)
                kontrol edin.
              </>
            }
            extra={
              <Link to="/login">
                <Button type="primary">Giriş Sayfasına Dön</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message="Şifre sıfırlama bağlantısı e-posta ile gönderilecektir."
              style={{ marginBottom: 16 }}
            />

            <Form<FormValues>
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              autoComplete="off"
              validateTrigger={['onBlur', 'onChange']}
            >
              <Form.Item
                name="email"
                label="E-posta"
                rules={[
                  { required: true, message: 'Lütfen e-posta adresinizi girin.' },
                  { type: 'email', message: 'Geçerli bir e-posta adresi girin.' },
                ]}
              >
                <Input
                  size="large"
                  prefix={<MailOutlined />}
                  placeholder="ornek@kooperatif.com"
                  autoComplete="email"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 12 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={loading}
                >
                  Şifre Sıfırlama Bağlantısı Gönder
                </Button>
              </Form.Item>
            </Form>

            <Paragraph style={{ textAlign: 'center', marginBottom: 0 }}>
              <Link to="/login">Giriş sayfasına dön</Link>
            </Paragraph>
          </>
        )}
      </Card>
    </div>
  )
}
