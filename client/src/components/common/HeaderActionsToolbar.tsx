import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { Space, Badge, Button, Drawer, Grid, Tooltip } from 'antd'
import { FilterOutlined } from '@ant-design/icons'

const { useBreakpoint } = Grid

/**
 * HeaderActionsToolbar — Option C (Toolbar Collapsing) pattern.
 *
 * Mobile (<768px / !screens.md):
 *   [primary inline] [Badge(filterCount) Button(Filtrele)]
 *   onClick → <Drawer right> içinde secondary action'lar
 *
 * Desktop (>=768px / screens.md):
 *   [primary inline] [secondary inline] — mevcut davranış
 *
 * SSR-safe: `screens.md === undefined` (ilk render) durumunda desktop varsay
 * (false negative'ler eklenmesin diye). Hydration sonrası gerçek değer gelir
 * ve Drawer trigger görünür.
 *
 * State: Drawer open/close internal — secondary'deki filter state'ler her
 * zaman parent sayfada kalır (HeaderActionsToolbar sadece UI sarmalar).
 *
 * Sprint: 20260511-ui-responsive-sprint (Option C extension)
 */
export interface HeaderActionsToolbarProps {
  /** Mobile'da inline kalan ana CTA (örn: "Yeni X" button, "CSV İndir") */
  primary?: ReactNode
  /** Desktop'ta inline + (default) mobile Drawer içinde sergilenecek action'lar */
  secondary: ReactNode
  /**
   * Mobile Drawer için özelleştirilmiş layout. Verilmezse `secondary` Drawer'a
   * `<Space direction="vertical">` ile sarılarak konur. Aidatlar gibi her
   * kontrolün vertical-stretch (width: '100%') olduğu sayfalar bu prop'la
   * dar genişlikli horizontal layout'tan ayrı render edebilir.
   */
  secondaryMobile?: ReactNode
  /** Drawer trigger Badge'inde gösterilecek aktif filter sayısı (0 = badge yok) */
  filterCount?: number
  /** Drawer title (default: "Filtreler") */
  drawerTitle?: string
}

export const HeaderActionsToolbar: React.FC<HeaderActionsToolbarProps> = ({
  primary,
  secondary,
  secondaryMobile,
  filterCount = 0,
  drawerTitle = 'Filtreler',
}) => {
  const screens = useBreakpoint()
  // SSR-safe: screens.md === undefined ilk render'da desktop varsay
  const isMobile = screens.md === false

  const [drawerOpen, setDrawerOpen] = useState(false)

  if (isMobile) {
    return (
      <>
        <Space size="small" wrap>
          {primary}
          {/*
           * 2026-05-24: Filtre butonu artık ikon-only + Tooltip; mobilde header
           * action chip'lerinin yan yana sığması için "Filtrele" text'i kaldırıldı.
           * Badge filterCount > 0 olduğunda yine sayıyı gösterir.
           */}
          <Badge count={filterCount} size="small" offset={[-4, 4]}>
            <Tooltip title={drawerTitle}>
              <Button
                icon={<FilterOutlined />}
                onClick={() => setDrawerOpen(true)}
                size="small"
                aria-label={drawerTitle}
              />
            </Tooltip>
          </Badge>
        </Space>
        <Drawer
          title={drawerTitle}
          placement="right"
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          width="min(360px, 90vw)"
          styles={{ body: { paddingTop: 12 } }}
        >
          {secondaryMobile !== undefined ? (
            secondaryMobile
          ) : (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {secondary}
            </Space>
          )}
        </Drawer>
      </>
    )
  }

  // Desktop: hepsi inline (mevcut davranış)
  return (
    <Space size="small" wrap>
      {primary}
      {secondary}
    </Space>
  )
}
