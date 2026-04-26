import { test, expect } from '@playwright/test'
import { login, navigateTo, ensureProject } from './helpers'

test.describe('Accounting Consistency (Pano vs. List vs. Detail)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('firm balance should be consistent between Dashboard and Firm List', async ({ page }) => {
    // 1. Get Project General Cari Bakiye from Dashboard
    await page.goto('/')
    const card = page.locator('text=Cari Bakiye >> .. >> .ant-statistic-content-value-number')
    await expect(card).toBeVisible({ timeout: 10000 })
    const dashboardCariBakiyeText = await card.textContent()
    const dashboardCariBakiye = parseFloat(dashboardCariBakiyeText?.replace(/\./g, '').replace(',', '.') || '0')

    // 2. Go to Firm List and sum all firm balances
    await navigateTo(page, 'Firmalar', 'Firma Listesi')
    
    // We get the totals from the STAT CARDS on the Firm List page (which should match the Pano)
    const firmListStatsBakiyeLocator = page.locator('text=Cari Bakiye >> .. >> .ant-statistic-content-value-number')
    await expect(firmListStatsBakiyeLocator.last()).toBeVisible({ timeout: 10000 })
    const firmListStatsBakiyeText = await firmListStatsBakiyeLocator.last().textContent()
    const firmListStatsBakiye = parseFloat(firmListStatsBakiyeText?.replace(/\./g, '').replace(',', '.') || '0')

    expect(firmListStatsBakiye).toBe(dashboardCariBakiye)
  })

  test('firm detail statistics should match firm list row values', async ({ page }) => {
    await navigateTo(page, 'Firmalar', 'Firma Listesi')
    
    // Check if any firm exists
    const tableRows = page.locator('.ant-table-row')
    const count = await tableRows.count()
    if (count === 0) {
      console.log('Skipping test: No firms found')
      return
    }

    // Get values of the first firm in the list
    const firstFirmRow = tableRows.first()
    const firmBakiyeText = await firstFirmRow.locator('td').nth(2).textContent()
    const firmBakiye = parseFloat(firmBakiyeText?.replace(' TL', '').replace(/\./g, '').replace(',', '.') || '0')

    // Click to go to detail
    await firstFirmRow.click()
    await expect(page).toHaveURL(/\/firmalar\/[a-z0-9-]+/)

    // Check Detail Stats Card
    const detailBakiyeLocator = page.locator('.stat-card:has-text("Cari Bakiye") .ant-statistic-content-value-number')
    await expect(detailBakiyeLocator).toBeVisible({ timeout: 10000 })
    const detailBakiyeText = await detailBakiyeLocator.textContent()
    const detailBakiye = parseFloat(detailBakiyeText?.replace(/\./g, '').replace(',', '.') || '0')

    expect(detailBakiye).toBe(firmBakiye)
  })

  test('member accounting: late fees and balances consistency', async ({ page }) => {
    await navigateTo(page, 'Üye Yönetimi')
    
    // Check if any member exists
    const memberRows = page.locator('.ant-table-row')
    const count = await memberRows.count()
    if (count === 0) {
      console.log('Skipping test: No members found')
      return
    }

    // Go to first member detail
    await memberRows.first().click()
    
    // Wait for data to load
    await page.waitForSelector('.ant-statistic-content-value-number')
    
    // Get stats from cards
    const totalAccruedText = await page.locator('text=Toplam Tahakkuk >> .. >> .ant-statistic-content-value-number').textContent()
    const totalPaidText = await page.locator('text=Toplam Ödeme >> .. >> .ant-statistic-content-value-number').textContent()
    const remainingDebtText = await page.locator('text=Geciken Borç >> .. >> .ant-statistic-content-value-number').textContent()
    
    const totalAccrued = parseFloat(totalAccruedText?.replace(/\./g, '').replace(',', '.') || '0')
    const totalPaid = parseFloat(totalPaidText?.replace(/\./g, '').replace(',', '.') || '0')
    const remainingDebt = parseFloat(remainingDebtText?.replace(/\./g, '').replace(',', '.') || '0')

    // Sum values from table
    const tableRowsDetail = page.locator('.ant-table-tbody .ant-table-row')
    const rowCount = await tableRowsDetail.count()
    
    let tableAccruedSum = 0
    let tablePaidSum = 0
    let tableRemainingSum = 0

    for (let i = 0; i < rowCount; i++) {
      const row = tableRowsDetail.nth(i)
      const accText = await row.locator('td').nth(4).textContent()
      const paidText = await row.locator('td').nth(5).textContent()
      const remText = await row.locator('td').nth(6).textContent()

      tableAccruedSum += parseFloat(accText?.replace(' TL', '').replace(/\./g, '').replace(',', '.') || '0')
      tablePaidSum += parseFloat(paidText?.replace(' TL', '').replace(/\./g, '').replace(',', '.') || '0')
      tableRemainingSum += parseFloat(remText?.replace(' TL', '').replace(/\./g, '').replace(',', '.') || '0')
    }

    // Verify consistency between cards and table
    expect(tableAccruedSum).toBeCloseTo(totalAccrued, 2)
    expect(tablePaidSum).toBeCloseTo(totalPaid, 2)
    expect(tableRemainingSum).toBeCloseTo(remainingDebt, 2)
  })
})
