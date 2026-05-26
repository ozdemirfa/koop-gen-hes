// Aktif proje ID için tek kaynak (single source of truth).
//
// Sorun (2026-05-26 öncesi): `activeProjectId` localStorage'da tutuluyor ve
// hem React (ProjectContext) hem React dışı kod (axios interceptor) hem de
// birkaç sayfa (FirmaDetailPage vs.) doğrudan localStorage'tan okuyordu.
// ProjectContext "ilk projeyi otomatik seç" branch'inde localStorage'a
// yazmayı atlıyordu → diğer okuyucular `null` görüyor → her istek 400.
//
// Çözüm: Vanilla TS store. ProjectContext yazıyor, herkes (React + interceptor
// + cross-tab) buradan okuyor. localStorage yine kullanılıyor — yalnızca
// persistence için (sayfa yenileme + cross-tab `storage` event sync).
//
// API minimal:
//   - getActiveProjectId(): string | null
//   - setActiveProjectId(id: string | null): void
//   - subscribe(listener): unsubscribe   (React'in useSyncExternalStore'una uyumlu)

const STORAGE_KEY = 'activeProjectId'
const UUID_LENGTH = 36

// "undefined" / "null" string'leri eski sürümlerden bulaşabilir; temizle.
function sanitize(raw: string | null): string | null {
  if (raw === null) return null
  if (raw === 'undefined' || raw === 'null' || raw === '') return null
  if (raw.length !== UUID_LENGTH) return null
  return raw
}

let current: string | null = (() => {
  try {
    return sanitize(localStorage.getItem(STORAGE_KEY))
  } catch {
    // SSR / private mode — localStorage erişilemez olabilir.
    return null
  }
})()

const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

export function getActiveProjectId(): string | null {
  return current
}

export function setActiveProjectId(id: string | null): void {
  const next = id ? sanitize(id) : null
  if (next === current) return
  current = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage yazılamıyorsa runtime state korunur, persistence kaybolur.
  }
  notify()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Cross-tab senkronizasyon: başka bir tab proje değiştirirse bu tab da yansıtsın.
// `storage` event yalnızca aynı origin'deki diğer tab'larda tetiklenir; bu tab
// kendi setActiveProjectId çağrısında tetiklemez (zaten notify edildi).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    const next = sanitize(e.newValue)
    if (next === current) return
    current = next
    notify()
  })
}
