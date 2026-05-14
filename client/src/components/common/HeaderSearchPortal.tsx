import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * HeaderSearchPortal — sayfa-sahipli (page-owned) header search slotu.
 *
 * Problem:
 *   AdminLayout/MainHeader, sayfa-tarafından LayoutContext üzerinden gönderilen
 *   `headerActions` ReactNode'unu tüketir. `setHeaderActionsStable` shallow
 *   (type + key) eşitliği bulunca prev'i tutar — bu shallow check, async data
 *   yüklendiğinde butonların belirmemesi (Hakediş Detay) bug'ı için bilinçli
 *   olarak geri kondu (PR #14 — pure ref equality React error #185 / infinite
 *   loop yaratmıştı).
 *
 *   Bu nedenle controlled text input içeren bir `<HeaderActionsToolbar>`,
 *   `key`'i sabit tutarsa Input'un value prop'u güncel olmaz (stale render),
 *   `key`'e arama metnini koyarsa Input her keystroke'ta unmount/mount olur
 *   (focus kaybı + ilk karakterden sonra yazılamama — PR #30/#33 semptomu).
 *
 * Çözüm:
 *   Search Input'unu LayoutContext zincirinden tamamen çıkar. Sayfa kendi
 *   render ağacında <HeaderSearchPortal>...</HeaderSearchPortal> render
 *   eder; bileşen children'ı `#admin-header-search-slot` DOM hedefine portal
 *   eder. Reconciliation hala sayfa subtree'sinde çalışır → search state
 *   değişimleri yalnızca Input'u re-render eder, asla unmount etmez. Focus
 *   ve controlled value korunur.
 *
 * Kullanım:
 *   <HeaderSearchPortal>
 *     <Input
 *       value={search}
 *       onChange={e => setSearch(e.target.value)}
 *       placeholder="Firma ara..."
 *       size="small"
 *       allowClear
 *       prefix={<SearchOutlined />}
 *       style={{ width: 220 }}
 *     />
 *   </HeaderSearchPortal>
 *
 *   Aynı sayfada birden fazla portal render edilmemeli; çoklu inputlar için
 *   children'ı sarmalayın (Space, Fragment).
 *
 * Sprint: 20260514-firma-search-keystroke-remount (PR #30/#33 sonrası kalıcı fix)
 */
export interface HeaderSearchPortalProps {
  children: React.ReactNode
}

export const HeaderSearchPortal: React.FC<HeaderSearchPortalProps> = ({ children }) => {
  // SSR-safe & "slot mounted after first paint" güvenliği: target'i state'te tutuyoruz
  // ve effect'le set ediyoruz. AdminLayout'un slot div'i sayfanın mount'undan sonra
  // hazır olabilir — null ise hiç render etme (header boş kalır, sayfa fonksiyonel).
  const [target, setTarget] = useState<Element | null>(null)

  useEffect(() => {
    const el = document.getElementById('admin-header-search-slot')
    setTarget(el)
  }, [])

  if (!target) return null
  return createPortal(children, target)
}
