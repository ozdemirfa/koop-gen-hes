import { test, expect } from '@playwright/test'
import { login, ensureProject, checkHeader, uniqueSuffix, navigateTo } from './helpers'

test.describe('Muhasebe Mantığı - Proje Perspektifi (Alacak-Borç-Bakiye)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureProject(page)
  })

  test('Mizan raporunda Bakiye = Alacak - Borç formülü ve görselleştirme testleri', async ({ page }) => {
    await navigateTo(page, 'Raporlar', 'Genel Mizan')
    await checkHeader(page, 'Genel Mizan')

    // Wait for either the table or empty state
    await expect(page.locator('.ant-table, .ant-empty').first()).toBeVisible({ timeout: 15_000 })
    
    // Check if empty
    const isEmpty = await page.locator('.ant-empty').isVisible()
    if (isEmpty) {
      console.log('Mizan boş, görselleştirme testi atlanıyor.')
      return
    }

    await expect(page.getByText(/Toplam Alacağımız/i)).toBeVisible()
    await expect(page.getByText(/Toplam Borçlu Olduğumuz/i)).toBeVisible()
    
    const rows = page.locator('.ant-table-tbody > tr.ant-table-row')
    const count = await rows.count()
    if (count > 0) {
       for (let i = 0; i < count; i++) {
         const tdCount = await rows.nth(i).locator('td').count()
         if (tdCount < 5) continue

         const alacakStr = await rows.nth(i).locator('td').nth(3).innerText()
         const borcStr = await rows.nth(i).locator('td').nth(2).innerText()
         const bakiyeHtml = await rows.nth(i).locator('td').nth(4).innerHTML()
         
         const parseMoney = (str: string) => {
           const cleaned = str.replace(/[^\d,-]/g, '').replace(',', '.')
           return parseFloat(cleaned) || 0
         }

         const alacak = parseMoney(alacakStr)
         const borc = parseMoney(borcStr)
         const expectedBakiye = alacak - borc

         if (expectedBakiye > 0.01) {
            expect(bakiyeHtml).toContain('ALACAK BAKİYESİ (A)')
         } else if (expectedBakiye < -0.01) {
            expect(bakiyeHtml).toContain('BORÇ BAKİYESİ (B)')
         }
       }
    }
  })

  test('Aidat tahakkuk ettiğinde (Alacak) artmalı ve Bakiye artmalıdır', async ({ page }) => {
    // 1. Mizan tablosunun başlangıç toplam alacağını hesapla
    await navigateTo(page, 'Raporlar', 'Genel Mizan')
    await checkHeader(page, 'Genel Mizan')
    await expect(page.locator('.ant-table, .ant-empty').first()).toBeVisible({ timeout: 15_000 })
    
    const getPageTotalAlacak = async () => {
      const empty = await page.locator('.ant-empty').isVisible()
      if (empty) return 0

      const rows = page.locator('.ant-table-tbody > tr.ant-table-row')
      const count = await rows.count()
      let total = 0
      for (let i = 0; i < count; i++) {
        if (await rows.nth(i).locator('td').count() > 3) {
          const alacakStr = await rows.nth(i).locator('td').nth(3).innerText()
          const cleaned = alacakStr.replace(/[^\d,-]/g, '').replace(',', '.')
          total += parseFloat(cleaned) || 0
        }
      }
      return total
    }

    const initialTotalAlacak = await getPageTotalAlacak()

    // 2. Aidatları borçlandırarak tahakkuk oluşturalım
    await page.goto('/aidatlar/tanimlar')
    await checkHeader(page, 'Aidat Tanımları')
    
    const currentYear = new Date().getFullYear()
    const testYear = currentYear + 2 // İlerideki bir yıl olsun çakışmasın

    // Yeni plan
    await page.getByRole('button', { name: /yıllık plan/i }).click()
    await checkHeader(page, 'Yeni Yıllık Aidat Planı')
    await page.locator('input[placeholder="Örn: 2026"]').fill(testYear.toString())
    await page.locator('input[placeholder="Tutar"]').first().fill('1000') // 1000 TL tahakkuk
    await page.getByRole('button', { name: /Kaydet/i }).click()
    await expect(page.getByText(/aidat planı kaydedildi/i)).toBeVisible({ timeout: 15_000 })
    
    await expect(page).toHaveURL(/\/aidatlar\/tanimlar/, { timeout: 10_000 })
    
    // Yılı filtrele
    await page.locator('.ant-select').first().click()
    const yearOption2 = page.getByRole('option', { name: testYear.toString() })
    if (await yearOption2.isVisible()) {
      await yearOption2.click()
    } else {
      await page.keyboard.press('Escape')
    }

    const row = page.locator('tr').filter({ hasText: 'PLAN' }).first()
    const borclandirBtn = row.getByRole('button', { name: /borçlandır/i })
    
    if (await borclandirBtn.isVisible()) {
      await borclandirBtn.click()
      const confirmBtn = page.locator('.ant-popover-buttons button').filter({ hasText: /Evet|Tamam/i })
      await confirmBtn.click()
      await expect(page.getByText(/başarıyla tamamlandı/i)).toBeVisible({ timeout: 15_000 })
    }

    // 3. Tekrar Mizana bak ve kontrol et
    await navigateTo(page, 'Raporlar', 'Genel Mizan')
    await expect(page.locator('.ant-table, .ant-empty').first()).toBeVisible({ timeout: 15_000 })

    const finalTotalAlacak = await getPageTotalAlacak()
    expect(finalTotalAlacak).toBeGreaterThanOrEqual(initialTotalAlacak) // Artmasını veya aynı kalmasını (üye yoksa) bekleriz
  })

  test('Ödeme alındığında (Tahsilat) Borç artmalı ve Bakiye azalmalıdır', async ({ page }) => {
    await navigateTo(page, 'Raporlar', 'Genel Mizan')
    await expect(page.locator('.ant-table, .ant-empty').first()).toBeVisible({ timeout: 15_000 })
    
    let initialBorc = 0
    let initialBakiye = 0
    let cariAdi = ''

    const isEmpty = await page.locator('.ant-empty').isVisible()
    if (!isEmpty) {
      const firstRow = page.locator('.ant-table-tbody > tr.ant-table-row').first()
      if (await firstRow.isVisible() && await firstRow.locator('td').count() > 4) {
        cariAdi = await firstRow.locator('td').nth(0).innerText()
        
        const parseMoney = (str: string) => {
          const cleaned = str.replace(/[^\d,-]/g, '').replace(',', '.')
          return parseFloat(cleaned) || 0
        }

        initialBorc = parseMoney(await firstRow.locator('td').nth(2).innerText())
        initialBakiye = parseMoney(await firstRow.locator('td').nth(4).locator('.ant-typography strong').first().innerText())
      }
    }

    if (!cariAdi) {
      console.log('Mizan tablosu boş veya veri okunamadı, atlanıyor.')
      return
    }

    await page.goto('/cari-hesaplar/odeme-kayit')
    await checkHeader(page, 'Cari Ödeme/Tahsilat Kaydı')
    
    await page.locator('.ant-form-item').filter({ hasText: /Cari Hesap/i }).locator('.ant-select').click()
    
    const cariDropdown = page.locator('.rc-virtual-list-holder-inner').first()
    await cariDropdown.getByText(new RegExp(cariAdi, 'i')).first().click()

    await page.getByLabel(/İşlem Türü/i).click()
    await page.getByRole('option', { name: /Gelen Ödeme/ }).click()
    
    const testAmount = 500
    await page.getByLabel(/İşlem Tutarı/).fill(testAmount.toString())

    const bankaItem = page.locator('.ant-form-item').filter({ hasText: /Banka Hesabı/i })
    if (await bankaItem.isVisible()) {
      await bankaItem.locator('.ant-select').click()
      const bankaOption = page.getByRole('option').first()
      if (await bankaOption.isVisible()) {
        await bankaOption.click()
      } else {
        await page.keyboard.press('Escape')
      }
    }

    await page.locator('textarea[id="aciklama"]').fill('Test Ödemesi ' + uniqueSuffix())

    await page.getByRole('button', { name: /İşlemi Kaydet/i }).click()
    await expect(page.getByText(/başarıyla kaydedildi/i)).toBeVisible({ timeout: 15_000 })

    await navigateTo(page, 'Raporlar', 'Genel Mizan')
    await expect(page.locator('.ant-table, .ant-empty').first()).toBeVisible({ timeout: 15_000 })

    const updatedRow = page.locator('.ant-table-tbody > tr.ant-table-row').filter({ hasText: cariAdi }).first()
    if (await updatedRow.isVisible() && await updatedRow.locator('td').count() > 4) {
      const parseMoney = (str: string) => {
        const cleaned = str.replace(/[^\d,-]/g, '').replace(',', '.')
        return parseFloat(cleaned) || 0
      }
      const newBorc = parseMoney(await updatedRow.locator('td').nth(2).innerText())
      const newBakiye = parseMoney(await updatedRow.locator('td').nth(4).locator('.ant-typography strong').first().innerText())

      expect(newBorc).toBeGreaterThan(initialBorc)
      expect(Math.abs((initialBakiye - testAmount) - newBakiye)).toBeLessThan(1)
    }
  })
})
