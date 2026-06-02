/**
 * Davet akışı E2E smoke (PR-C).
 *
 * Public route smoke (login gerektirmez) — bu sprintte yeşil olması beklenir.
 * Authenticated flow'lar SKIP — Supabase Auth fetch fail (issue #78); test infra
 * fix sonrası yeşilleşecek.
 */

import { test, expect } from '@playwright/test'

test.describe('Davet akışı — public smoke', () => {
  test('/davet-kabul kimliksiz erişim login redirect etmez (public route)', async ({ page }) => {
    await page.goto('/davet-kabul/somerandomtoken123456789012345')
    await expect(page).toHaveURL(/\/davet-kabul\/somerandomtoken123456789012345$/)
  })

  // NOTE: Preview API'sine bağlı testler lokal dev server'da değişken davranıyor —
  // backend production Supabase'e bağlandığında 404 vs network fail farklı state
  // veriyor. Bu testler test infra fix sonrası (issue #78) authenticated suite
  // ile birlikte gerçekçi koşulabilir.
  test.skip('/davet-kabul/invalid-token error state', async ({ page }) => {
    await page.goto('/davet-kabul/invalid-token-xxx')
    await expect(page.getByText(/Davet kullanılamıyor/i)).toBeVisible({ timeout: 15_000 })
  })

  test.skip('/davet-kabul kısa token preview reddedilir', async ({ page }) => {
    await page.goto('/davet-kabul/x')
    await expect(page.getByText(/Davet bilgileri alınamadı|Davet kullanılamıyor/i)).toBeVisible({
      timeout: 15_000,
    })
  })
})

test.describe('Davet akışı — authenticated smoke (test infra fix sonrası)', () => {
  test.beforeEach(async () => {
    // issue #78 (signInWithPassword fetch) ÇÖZÜLDÜ (CLOSED). Ancak aşağıdaki
    // testler henüz implemente edilmedi (boş stub gövde) — un-skip edilirse
    // assertion'sız trivial "pass" verir (sahte-yeşil). Implementasyona kadar
    // bilinçli skip. E2E-1 (kalite-guvenlik-2026-06).
    test.skip(true, 'Authenticated invitation suite implemente edilmedi (stub) — #78 çözüldü ama test gövdeleri yazılmadı')
  })

  test('login sonrası InvitationBanner pending davet için görünür', async () => {
    // Mock pending davet ile AdminLayout banner Alert + Kabul Et + Reddet butonları
  })

  test('KullaniciYonetimi 3 sekme (Aktif / Bekleyen / Geçmiş) render', async () => {
    // /admin/kullanicilar üzerinde Tabs (defaultActiveKey="active")
  })

  test('ProjeListPage Bekleyen Davetler section pending davet ile gösterilir', async () => {
    // Divider + "Bekleyen Davetler" başlığı + tablo
  })
})
