import { test, expect } from '@playwright/test'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 6) — Viewer perspective
 *
 * **SKELETON**: Bu spec ayrı bir test kullanıcısı (E2E_VIEWER_USER / E2E_VIEWER_PASSWORD)
 * + Supabase seed migration (viewer role'üne sahip bir kullanıcı yaratan) ile çalışır.
 * Mevcut e2e altyapı tek-user (E2E_USER owner). Bu skeleton ileri sprint'te
 * dedicated viewer fixture eklendiğinde aktive edilebilir.
 *
 * Hedef senaryolar (aktivasyon sonrası):
 *  1. Viewer login → AdminLayout header'da `data-testid="role-viewer-tag"` görünür.
 *  2. /firmalar → "Yeni Firma" butonu disabled, hover tooltip "Yetkiniz yok".
 *  3. /uyeler → "Yeni" butonu disabled.
 *  4. /hakedisler → "Yeni Hakediş" disabled; satır sil ikonları yok.
 *  5. /faturalar → "Yeni Fatura" disabled.
 *  6. /banka-hesaplari → "Yeni Hesap" disabled.
 *  7. /cek-takibi → "Yeni Çek" disabled; durum değiştirme butonları yok.
 *  8. /virmanlar → "Yeni Virman" disabled.
 *
 * Backend RBAC smoke (server/tests/integration/rbac.smoke.test.ts) HTTP
 * seviyesinde 403 izin reddini zaten kapsiyor; bu spec UI gating'in (frontend
 * disabled state + tooltip) görsel/UX regresyonunu yakalar.
 */

test.describe.skip('Viewer perspective — UI read-only gating', () => {
  test('AdminLayout viewer Tag render', async ({ page }) => {
    // TODO: dedicated viewer login fixture ile aktive et.
    // 1. login as viewer
    // 2. ensure activeProject seçili
    // 3. expect(page.getByTestId('role-viewer-tag')).toBeVisible()
    expect(true).toBe(true)
  })

  test('FirmaListPage "Yeni Firma" disabled + tooltip', async ({ page }) => {
    // TODO: login as viewer; goto /firmalar
    // const btn = page.getByRole('button', { name: /Yeni Firma/i })
    // await expect(btn).toBeDisabled()
    // await btn.hover()
    // await expect(page.getByText(/Yetkiniz yok/i)).toBeVisible()
    expect(true).toBe(true)
  })

  test('UyeListPage "Yeni" disabled', async ({ page }) => {
    // TODO: login as viewer; goto /uyeler; "Yeni" button disabled
    expect(true).toBe(true)
  })

  test('HakedisListPage "Yeni Hakediş" disabled', async ({ page }) => {
    expect(true).toBe(true)
  })

  test('FaturaListPage "Yeni Fatura" disabled', async ({ page }) => {
    expect(true).toBe(true)
  })

  test('BankaHesapListPage "Yeni Hesap" disabled', async ({ page }) => {
    expect(true).toBe(true)
  })

  test('VirmanListPage "Yeni Virman" disabled', async ({ page }) => {
    expect(true).toBe(true)
  })
})
