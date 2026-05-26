import React from 'react'
import { Alert } from 'antd'
import { DisconnectOutlined } from '@ant-design/icons'
import { usePermissions } from '../../hooks/usePermissions'
import { useProject } from '../../contexts/ProjectContext'

// Sprint desktop-offline-mode (2026-05-26):
//   OfflineProjectBanner — proje çevrimdışı moddayken AdminLayout'un en üstüne
//   binen sticky bildirim. İki rol farklı mesaj görür:
//
//   - Non-owner (manager + user): "Bu proje çevrimdışı modda. Proje sahibi
//     tekrar açana kadar yalnızca görüntüleyebilir, kayıt değişiklik
//     yapamazsınız." → tüm write butonları zaten usePermissions clause'u ile
//     disable'da.
//
//   - Owner: "Bu projeyi çevrimdışı moda aldınız. Diğer kullanıcılar yalnız
//     görüntüleme yapabilir. Masaüstü uygulamada bekleyen değişiklikleri
//     yükleyip online'a dönmeyi unutmayın." → bilgilendirici, write engeli yok.
//
//   Toggle UI'ı web tarafında YOK (kasıtlı — toggle yalnız desktop'tan
//   yapılmalı çünkü desktop pending queue + flush mekanizması sağlıyor).
//   Web'de online'a dönüş butonu olsaydı queue flush atlanabilirdi.

export const OfflineProjectBanner: React.FC = () => {
  const { isOfflineMode, isOwner } = usePermissions()
  const { activeProject } = useProject()

  if (!isOfflineMode || !activeProject) {
    return null
  }

  const ownerMessage = (
    <>
      Bu projeyi çevrimdışı moda aldınız. Diğer kullanıcılar yalnız okuma
      yapabilir. Masaüstü uygulamada bekleyen değişiklikleri yükleyip{' '}
      <strong>Online'a Geç</strong> butonuyla projeyi tekrar herkese açın.
    </>
  )

  const restrictedMessage = (
    <>
      Bu proje, proje sahibi tarafından çevrimdışı moda alındı. Proje sahibi
      tekrar açana kadar <strong>yalnızca görüntüleyebilirsiniz</strong>; kayıt,
      değişiklik ve üye ekleme/silme işlemleri yapılamaz.
    </>
  )

  return (
    <Alert
      type={isOwner ? 'info' : 'warning'}
      showIcon
      icon={<DisconnectOutlined />}
      message={
        isOwner
          ? `${activeProject.proje_adi} — Çevrimdışı modda (sizin aldığınız)`
          : `${activeProject.proje_adi} — Çevrimdışı modda`
      }
      description={isOwner ? ownerMessage : restrictedMessage}
      banner
      data-testid="offline-project-banner"
      data-offline-role={isOwner ? 'owner' : 'restricted'}
    />
  )
}
