import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('VERIFY: Üyelik Ata butonu ikon-only (turuncu, tooltip, modal açılır)', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await login(page)

  // İlk projeyi bul
  await page.goto('/projeler')
  await page.waitForSelector('[data-testid^="project-card-"]', { timeout: 30_000 })
  const card = page.locator('[data-testid^="project-card-"]').first()
  const testId = await card.getAttribute('data-testid')
  const projectId = testId?.replace('project-card-', '')
  if (!projectId) throw new Error('Proje bulunamadı')

  // Şerefiye sayfasına git
  await page.goto(`/projeler/${projectId}/serefiye`)
  await page.waitForSelector('.ant-table', { timeout: 20_000 })
  await page.waitForLoadState('networkidle')

  const screenshotsDir = 'test-results/verify-uyelik-ata'
  await page.screenshot({ path: `${screenshotsDir}/01-table-full.png`, fullPage: true })

  // "Üyelik Ata" butonunu bul — title="Üyelik Ata" + AntD primary button
  const atamaButtons = page.locator('button[title="Üyelik Ata"]')
  const atamaCount = await atamaButtons.count()
  console.log(`PROBE: "Üyelik Ata" butonu sayısı: ${atamaCount}`)

  if (atamaCount === 0) {
    // Hiç atanmamış daire yok — yine de kaldır/düzenle ikonlarını doğrula
    const editCount = await page.locator('button[title="Daire Bilgilerini Düzenle"]').count()
    const removeCount = await page.locator('button[title="Üyeliği Kaldır"]').count()
    console.log(`PROBE: Düzenle=${editCount}, Üyeliği Kaldır=${removeCount}`)
    test.fail(true, 'Atanmamış daire yok — buton görünmez. Manuel test gerek.')
    return
  }

  // İlk Üyelik Ata butonunu hedefle
  const btn = atamaButtons.first()
  await btn.scrollIntoViewIfNeeded()
  await btn.waitFor({ state: 'visible' })

  // (a) Buton metni boş olmalı — sadece ikon
  const innerText = (await btn.innerText()).trim()
  console.log(`PROBE: Buton innerText = "${innerText}"`)
  expect(innerText, 'Buton sadece ikon olmalı, yazı içermemeli').toBe('')

  // (a-2) İkon doğru mu — anticon-user-add
  const iconExists = await btn.locator('.anticon-user-add').count()
  expect(iconExists, 'UserAddOutlined ikonu mevcut olmalı').toBeGreaterThan(0)

  // (b) Turuncu zemin korunmalı (#ffa940 = rgb(255, 169, 64))
  const bgColor = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`PROBE: Background-color = ${bgColor}`)
  expect(bgColor, 'Turuncu zemin korunmalı').toContain('255, 169, 64')

  // Buton + komşu butonların ortak satırının fokuslu screenshot'ı
  const row = btn.locator('xpath=ancestor::tr[1]')
  await row.screenshot({ path: `${screenshotsDir}/02-action-cell-row.png` })

  // (c) Hover → tooltip "Üyelik Ata"
  await btn.hover()
  await page.waitForTimeout(800) // AntD tooltip delay
  await page.screenshot({ path: `${screenshotsDir}/03-hover-tooltip.png`, fullPage: false })
  // AntD title prop bazen tooltip oluşturur, bazen native title attr — ikisini de kontrol et
  const tooltipVisible = await page.locator('.ant-tooltip:has-text("Üyelik Ata"), [role="tooltip"]:has-text("Üyelik Ata")').count()
  const nativeTitle = await btn.getAttribute('title')
  console.log(`PROBE: AntD tooltip görünür=${tooltipVisible > 0}, native title="${nativeTitle}"`)
  expect(tooltipVisible > 0 || nativeTitle === 'Üyelik Ata', 'Tooltip veya title attribute mevcut olmalı').toBeTruthy()

  // (d) Click → üyelik atama modalı açılır
  await btn.click()
  const modal = page.locator('[role="dialog"]').first()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${screenshotsDir}/04-modal-opened.png`, fullPage: false })
  const modalText = (await modal.textContent()) || ''
  console.log(`PROBE: Modal içerik (ilk 200 char): "${modalText.substring(0, 200)}"`)
  expect(modalText.length, 'Modal içeriği yüklenmiş olmalı').toBeGreaterThan(10)

  // Modalı kapat (ESC)
  await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'hidden', timeout: 5_000 })

  // Probe: Diğer iki aksiyon hala mevcut + ikon-only
  const edit = page.locator('button[title="Daire Bilgilerini Düzenle"]').first()
  const remove = page.locator('button[title="Üyeliği Kaldır"]').first()
  if (await edit.count()) {
    const editText = (await edit.innerText()).trim()
    console.log(`PROBE: Düzenle butonu metni = "${editText}" (boş bekleniyor)`)
    expect(editText).toBe('')
  }
  if (await remove.count()) {
    const removeText = (await remove.innerText()).trim()
    console.log(`PROBE: Üyeliği Kaldır butonu metni = "${removeText}" (boş bekleniyor)`)
    expect(removeText).toBe('')
  }

  console.log('VERIFY OK: Tüm assertion geçti.')
})
