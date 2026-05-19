import React from 'react'
import { Result, Button } from 'antd'
import { useNavigate } from 'react-router-dom'

// Sprint 20260520-frontend-role-awareness (Faz 3a):
// 403 sayfası — ProtectedRoute requireRole başarısız olunca buraya yönlendirilir.

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <Result
      status="403"
      title="Yetki Yok"
      subTitle="Bu sayfayı görüntüleme izniniz bulunmuyor. Bir proje yöneticisiyle iletişime geçin."
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          Panoya Dön
        </Button>
      }
    />
  )
}
