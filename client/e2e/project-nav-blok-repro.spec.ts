import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Project Nav & Blok CRUD Task Verification', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000)
    await login(page)
    await page.goto('/projeler')
  })

  test('US-01: Proje Kart Navigasyonu - Farklı Alanlar', async ({ page }) => {
    // Ensure at least one project exists
    const cardCount = await page.locator('.ant-card').count()
    if (cardCount === 0) {
      await page.getByRole('button', { name: /yeni proje/i }).click()
      await page.locator('#proje_adi').fill('Nav Repro Proje')
      await page.locator('input[placeholder="Örn: A"]').fill('A')
      await page.locator('#bloklar_0_toplam_daire').fill('10')
      await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 })
    }

    const firstCard = page.locator('.ant-card').first()
    await expect(firstCard).toBeVisible({ timeout: 15000 })
    
    // 1. Click on card title area
    const cardTitle = firstCard.locator('[data-testid="card-title"]')
    await expect(cardTitle).toBeVisible({ timeout: 15000 })
    await cardTitle.click()
    await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goBack()

    // 2. Click on card body (whitespace)
    const cardBody = firstCard.locator('[data-testid="card-body"]')
    await cardBody.click({ position: { x: 50, y: 10 } }) 
    await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goBack()

    // 3. Click on card actions (EDIT button) - SHOULD NOT navigate
    const editBtn = firstCard.locator('[data-testid^="edit-project-"]').first()
    await editBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(page.url()).toMatch(/\/projeler$/)
  })

  test('US-02 & US-03: Blok Yönetimi ve Mükerrerlik Testi', async ({ page }) => {
    const projeAdi = `Blok Task ${uniqueSuffix()}`
    
    // 1. Yeni Proje oluştur (1 Bloklu)
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('#bloklar_0_blok_adi').fill('Blok-Test-Alpha')
    await page.locator('#bloklar_0_toplam_daire').fill('12')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText(/proje kaydedildi/i)).toBeVisible()
    
    // 2. Proje Düzenle: Blok Ekle
    const card = page.locator('.ant-card').filter({ hasText: projeAdi })
    await card.locator('[data-testid^="edit-project-"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    
    await page.getByRole('button', { name: /blok ekle/i }).click()
    // Find the last block entry (index 1 if there was 1)
    await page.locator('input[id$="_blok_adi"]').last().fill('Blok-Test-Beta')
    await page.locator('input[id$="_toplam_daire"]').last().fill('24')
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    
    // 3. Proje Düzenle: Blok Sil ve Mevcut İsmi Değiştirmeden Kaydet (Mükerrerlik Testi)
    await page.waitForTimeout(500)
    await card.locator('[data-testid^="edit-project-"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    
    // Check values
    const inputs = await page.locator('input[id$="_blok_adi"]').all()
    const values = await Promise.all(inputs.map(i => i.inputValue()))
    
    expect(values).toContain('Blok-Test-Alpha')
    expect(values).toContain('Blok-Test-Beta')
    
    const deleteButtons = page.locator('.ant-btn-dangerous')
    await expect(deleteButtons).toHaveCount(2)
    
    // Find the delete button for Beta specifically
    let indexToDelete = -1
    for (let i = 0; i < values.length; i++) {
      if (values[i] === 'Blok-Test-Beta') {
        indexToDelete = i
        break
      }
    }
    
    if (indexToDelete !== -1) {
      await deleteButtons.nth(indexToDelete).click()
    } else {
      await deleteButtons.last().click()
    }
    
    // When only 1 block remains, the delete button is hidden per UI logic
    await expect(page.locator('.ant-btn-dangerous')).toHaveCount(0)
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    
    // Check for validation errors if it doesn't hide quickly
    try {
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 })
    } catch (e) {
      const errors = await page.locator('.ant-form-item-explain-error').allInnerTexts()
      if (errors.length > 0) console.log('FORM VALIDATION ERRORS:', errors)
      throw e
    }
    
    // Verification
    const cardId = await card.getAttribute('data-testid')
    const id = cardId?.replace('project-card-', '')
    
    if (id) {
      await page.goto(`/projeler/${id}`)
    } else {
      await card.locator('[data-testid^="view-project-"]').click()
    }
    
    // Wait for page to load
    await page.waitForURL(/\/projeler\/[a-zA-Z0-9-]+/, { timeout: 15000 })
    
    // Wait for detail page content
    const detailHeader = page.locator('h1, h2, .ant-page-header-heading-title, span').filter({ hasText: projeAdi })
    await expect(detailHeader.first()).toBeVisible({ timeout: 15000 })
    
    // Check for card title
    const detailCard = page.locator('.ant-card', { hasText: 'Proje Bilgileri' })
    await expect(detailCard).toBeVisible({ timeout: 15000 })
    
    // Verify values in card
    await expect(detailCard).toContainText('Blok Sayısı', { timeout: 10000 })
    await expect(detailCard).toContainText('1', { timeout: 10000 })
  })
})
