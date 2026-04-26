import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Yıllık Plan Gelişmiş Özellikler', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000)
    await login(page)
  })

  test('yearly plan should manage rows and show validation', async ({ page }) => {
    const suffix = uniqueSuffix()
    const projeName = `Plan Test ${suffix}`
    const kalemTanim = `Harcama Kalemi ${suffix}`

    // 1. Create Project
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeName)
    await page.locator('input[placeholder="Örn: A"]').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('10')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(projeName)).toBeVisible()

    // 2. Try to create plan without kalem (should show error/warning)
    await page.locator(`[data-testid^="project-card-"]`).filter({ hasText: projeName }).locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /yıllık plan/i }).click()
    
    // Check if plan exists or needs to be created
    const createBtn = page.getByRole('button', { name: /şimdi oluştur/i })
    if (await createBtn.isVisible()) {
      await createBtn.click()
      await expect(page.getByText(/önce harcama kalemi eklemelisiniz/i)).toBeVisible()
    }

    // 3. Add Harcama Kalemi
    await page.getByRole('button', { name: /harcama kalemi ekle/i }).click()
    await page.locator('#tanim').fill(kalemTanim)
    await page.locator('#butce_tutari').fill('100000')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(kalemTanim)).toBeVisible()

    // 4. Create Plan
    await page.getByRole('button', { name: /yıllık plan/i }).click()
    if (await createBtn.isVisible()) {
      await createBtn.click()
    }
    await expect(page.getByText(/yıllık plan oluşturuldu/i).or(page.getByText(kalemTanim))).toBeVisible()

    // 5. Add Another Kalemi and Use "Satır Ekle"
    const kalemTanim2 = `İkinci Kalem ${suffix}`
    await page.getByRole('button', { name: /satır ekle/i }).click()
    // No second kalem yet, check message
    await expect(page.getByText(/yeni bir harcama kalemi bulunamadı/i)).toBeVisible()
    await page.getByRole('button', { name: 'Kapat' }).or(page.getByRole('button', { name: 'İptal' })).click()

    // Add it from project detail
    const projectUrl = page.url().split('/yillik-plan')[0]
    await page.goto(projectUrl) 
    await page.getByRole('button', { name: /harcama kalemi ekle/i }).click()
    await page.locator('#tanim').fill(kalemTanim2)
    await page.getByRole('button', { name: 'Kaydet' }).click()

    // Go back to plan and add row
    await page.getByRole('button', { name: /yıllık plan/i }).click()
    await page.getByRole('button', { name: /satır ekle/i }).click()
    await page.locator('.ant-modal-body .ant-select-selector').click()
    await page.getByText(kalemTanim2).click()
    await page.getByRole('button', { name: 'Ekle' }).click()
    await expect(page.getByText(kalemTanim2)).toBeVisible()

    // 6. Delete Row
    await page.locator('tr').filter({ hasText: kalemTanim }).locator('button').filter({ hasText: /sil/i }).or(page.locator('tr').filter({ hasText: kalemTanim }).locator('.anticon-delete')).click()
    await page.getByRole('button', { name: 'Evet' }).click()
    await expect(page.getByText(kalemTanim)).toBeHidden()
  })
})
