/**
 * Davet kabul sayfası — yeni kullanıcı akışı.
 * Route: /davet-kabul/:token (public — App.tsx'te ProtectedRoute dışında)
 *
 * Akış:
 *   1. Mount → GET /api/invitations/by-token/:token ile preview (e-mail, proje adı)
 *   2. Form: e-mail (read-only) + 6 haneli OTP + şifre + tekrar
 *   3. Submit → POST /api/invitations/accept-by-token → otomatik signInWithPassword → /
 *
 * Hata durumları:
 *   - 404/400 token bulunamadı / süresi dolmuş → error state
 *   - 429 rate-limit aşıldı → "biraz bekleyin" mesajı
 *   - 400 yanlış OTP → kalan deneme sayısı backend mesajından alınır
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md §6.1
 */

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Alert, App, Button, Card, Form, Input, Result, Spin, Typography } from 'antd'
import { LockOutlined, KeyOutlined, MailOutlined } from '@ant-design/icons'
import { invitationsApi } from '../../lib/invitationsApi'
import { supabase } from '../../lib/supabase'
import type { InvitationPreview } from '../../types/invitation'

interface FormValues {
  otp: string
  password: string
  confirmPassword: string
}

export const DavetKabulPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [errorState, setErrorState] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    invitationsApi
      .previewByToken(token)
      .then((p) => {
        if (cancelled) return
        if (p.expired) {
          setErrorState('Davetin süresi dolmuş veya artık geçerli değil. Lütfen yöneticiyle iletişime geçin.')
        } else {
          setPreview(p)
        }
      })
      .catch((err: any) => {
        if (cancelled) return
        // api.ts interceptor `error.response.data` ile reject ediyor + statusCode'u
        // non-enumerable olarak ekliyor; AxiosError fallback'i için response.status da kontrol.
        const status = err?.statusCode ?? err?.status ?? err?.response?.status
        if (status === 404 || status === 400) {
          setErrorState('Davet bulunamadı. Linki kontrol edin veya yöneticiyle iletişime geçin.')
        } else if (status === 429) {
          setErrorState('Çok fazla istek. Lütfen birkaç dakika sonra tekrar deneyin.')
        } else {
          setErrorState('Davet bilgileri alınamadı. Lütfen daha sonra tekrar deneyin.')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (values: FormValues) => {
    if (!preview) return
    setLoading(true)
    try {
      await invitationsApi.acceptByToken({ token, otp: values.otp, password: values.password })
      // Otomatik login dene
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: preview.email,
        password: values.password,
      })
      if (loginErr) {
        message.warning('Davet kabul edildi ancak otomatik giriş yapılamadı. Lütfen login sayfasından giriş yapın.')
        navigate('/login')
        return
      }
      message.success('Davet kabul edildi. Panoya yönlendiriliyorsunuz...')
      setTimeout(() => navigate('/'), 1200)
    } catch (err: any) {
      // err = interceptor'dan gelen body ({ success: false, error, ... }) + statusCode non-enumerable.
      // AxiosError fallback için response.status/data da kontrol.
      const status = err?.statusCode ?? err?.status ?? err?.response?.status
      const errMessage = err?.error ?? err?.response?.data?.error
      if (status === 429) {
        message.error('Çok fazla istek. Lütfen biraz bekleyin.')
      } else if (status === 400 && typeof errMessage === 'string') {
        message.error(errMessage)
      } else {
        message.error('Davet tamamlanamadı. Lütfen daha sonra tekrar deneyin.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (previewLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (errorState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Result
          status="error"
          title="Davet kullanılamıyor"
          subTitle={errorState}
          extra={
            <Link to="/login">
              <Button type="primary">Giriş Sayfasına Dön</Button>
            </Link>
          }
        />
      </div>
    )
  }

  if (!preview) return null

  // PR-B: yetkili daveti ayrı başlık + mesaj (proje yok)
  const isYetkiliInvitation = preview.invited_role === 'yetkili'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 520 }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          {isYetkiliInvitation ? 'Sisteme Yetkili Olarak Davet Edildiniz' : 'Daveti Tamamlayın'}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {isYetkiliInvitation
            ? 'Sisteme yetkili olarak davet edildiniz. Maildeki 6 haneli doğrulama kodunu girin ve şifrenizi belirleyin.'
            : (
              <>
                <strong>"{preview.proje_adi}"</strong> projesine davet edildiniz. Maildeki 6 haneli doğrulama
                kodunu girin ve şifrenizi belirleyin.
              </>
            )
          }
        </Typography.Paragraph>

        <Alert
          type="info"
          showIcon
          message={`Davet ${new Date(preview.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerlidir.`}
          style={{ marginBottom: 16 }}
        />

        <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item label="E-Posta" htmlFor="davet-email-preview">
            <Input
              id="davet-email-preview"
              prefix={<MailOutlined />}
              value={preview.email}
              disabled
            />
          </Form.Item>
          <Form.Item
            name="otp"
            label="6 Haneli Doğrulama Kodu"
            rules={[
              { required: true, message: 'Kodu girin' },
              { pattern: /^\d{6}$/, message: '6 haneli olmalı' },
            ]}
          >
            <Input
              prefix={<KeyOutlined />}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Yeni Şifre"
            rules={[
              { required: true, message: 'Şifre girin' },
              { min: 8, message: 'En az 8 karakter' },
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
            dependencies={['password']}
            rules={[
              { required: true, message: 'Tekrar girin' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('Şifreler eşleşmiyor'))
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
              Daveti Tamamla ve Giriş Yap
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
