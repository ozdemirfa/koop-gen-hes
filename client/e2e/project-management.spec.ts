import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Project Management E2E Tests', () => {
  // Her test için ayrı bir proje adı kullanarak izolasyon sağlayalım
  const getNewProjectName = () => `Auto Project ${uniqueSuffix()}`

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000)
    await login(page)
    await page.goto('/projeler')
  })

  async function createProject(page: any, name: string) {
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(name)
    await page.locator('#bloklar_0_blok_adi').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('10')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    // Mesajı beklemek yerine modalın kapanmasını ve kartın gelmesini bekleyelim
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 })
    await expect(page.locator('.ant-card').filter({ hasText: name })).toBeVisible({ timeout: 15000 })
  }

  test('1. Navigasyon: Kartın başlığına, gövdesine ve sağ okuna tıklandığında detay sayfasına gitmeli', async ({ page }) => {
    const name = getNewProjectName()
    await createProject(page, name)

    const card = page.locator('.ant-card').filter({ hasText: name })

    // a) Başlığa tıklama
    await card.locator('[data-testid="card-title"]').click()
    await page.waitForURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goto('/projeler')

    // b) Gövdeye tıklama
    await page.locator('.ant-card').filter({ hasText: name }).locator('[data-testid="card-body"]').click()
    await page.waitForURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goto('/projeler')

    // c) Sağ ok (Görüntüle) ikonuna tıklama
    await page.locator('.ant-card').filter({ hasText: name }).locator('[data-testid^="view-project-"]').click()
    await page.waitForURL(/\/projeler\/[a-zA-Z0-9-]+/)
  })

  test('2. Propagation: Düzenle butonuna basıldığında detay sayfasına gitmemeli, modal açılmalı', async ({ page }) => {
    const name = getNewProjectName()
    await createProject(page, name)

    const card = page.locator('.ant-card').filter({ hasText: name })
    
    // Düzenle butonuna tıkla
    await card.locator('[data-testid^="edit-project-"]').click()
    
    // Modalın açıldığını doğrula
    await expect(page.getByRole('dialog')).toBeVisible()
    
    // URL'nin değişmediğini doğrula
    expect(page.url()).toMatch(/\/projeler$/)
    
    // Modalı kapat
    await page.getByRole('dialog').getByRole('button', { name: 'İptal', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('3. Mükerrer Blok: Mevcut bir blok ismini değiştirmeden kaydetmek mükerrer kayıt oluşturmamalı', async ({ page }) => {
    const name = getNewProjectName()
    await createProject(page, name)

    const card = page.locator('.ant-card').filter({ hasText: name })
    await card.locator('[data-testid^="edit-project-"]').click()
    
    // Mevcut 'A' bloğu formda gelmeli
    await expect(page.locator('input[id$="_blok_adi"]').first()).toHaveValue('A')
    
    // Hiçbir şeyi değiştirmeden Kaydet'e bas
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Detay sayfasına git ve blok sayısının hala 1 olduğunu doğrula
    const cardId = await card.getAttribute('data-testid')
    const id = cardId?.replace('project-card-', '')
    await page.goto(`/projeler/${id}`)
    
    await expect(page.locator('.ant-card', { hasText: 'Proje Bilgileri' })).toContainText('1')
  })

  test('4. Blok Silme: Listeden bir blok silinip kaydedildiğinde kalıcı olarak silinmeli', async ({ page }) => {
    const name = getNewProjectName()
    await createProject(page, name)

    const card = page.locator('.ant-card').filter({ hasText: name })
    
    // Önce ikinci bir blok ekleyelim
    await card.locator('[data-testid^="edit-project-"]').click()
    await page.getByRole('button', { name: /blok ekle/i }).click()
    await page.locator('input[id$="_blok_adi"]').last().fill('B')
    await page.locator('input[id$="_toplam_daire"]').last().fill('20')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Şimdi 'B' bloğunu silmek için tekrar aç
    await card.locator('[data-testid^="edit-project-"]').click()
    const firstInput = page.locator('input[id$="_blok_adi"]').first()
    await expect(firstInput).toBeVisible({ timeout: 15000 })
    
    const inputs = await page.locator('input[id$="_blok_adi"]').all()
    const values = await Promise.all(inputs.map(i => i.inputValue()))
    expect(values).toContain('B')
    
    // İkinci bloğun silme butonuna bas
    const deleteButtons = page.locator('.ant-btn-dangerous')
    await expect(deleteButtons).toHaveCount(2)
    
    // Find index of 'B'
    let indexToDelete = -1
    for (let i = 0; i < values.length; i++) {
      if (values[i] === 'B') {
        indexToDelete = i
        break
      }
    }
    await deleteButtons.nth(indexToDelete).click()
    
    // When only 1 remains, delete button is hidden
    await expect(page.locator('.ant-btn-dangerous')).toHaveCount(0)
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Detay sayfasında blok sayısının 1'e düştüğünü doğrula
    const cardId = await card.getAttribute('data-testid')
    const id = cardId?.replace('project-card-', '')
    await page.goto(`/projeler/${id}`)
    
    await expect(page.locator('.ant-card', { hasText: 'Proje Bilgileri' })).toContainText('1')
  })
})
