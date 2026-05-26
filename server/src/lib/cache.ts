/**
 * Generic hot-swap cache wrapper.
 *
 * REDIS_URL yoksa → in-memory Map backend (graceful degradation, mevcut davranış korunur)
 * REDIS_URL varsa → ioredis backend + pub/sub cross-instance invalidation
 *
 * Lifecycle:
 *   - init()     → bağlantı kur (REDIS_URL yoksa no-op)
 *   - shutdown() → bağlantıyı temiz kapat (SIGTERM/SIGINT hook'u için)
 *
 * Lazy import: REDIS_URL set edilmemişse `ioredis` hiç yüklenmez —
 * Render dyno cold-start hızını korur, ioredis paketinin yokluğunda da çalışır.
 *
 * Key namespace örneği: `offline:${projeId}`
 */

// ─── Interface ────────────────────────────────────────────────────────────────

export interface CacheBackend {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>
  invalidate(key: string): Promise<void>
  health(): Promise<'disabled' | 'connected' | 'disconnected'>
  init(): Promise<void>
  shutdown(): Promise<void>
}

// ─── In-memory backend ────────────────────────────────────────────────────────

interface InMemoryEntry {
  value: unknown
  expiresAt: number
}

export class InMemoryBackend implements CacheBackend {
  private store = new Map<string, InMemoryEntry>()

  async get(key: string): Promise<unknown> {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  async invalidate(key: string): Promise<void> {
    this.store.delete(key)
  }

  async health(): Promise<'disabled'> {
    return 'disabled'
  }

  async init(): Promise<void> {
    // no-op
  }

  async shutdown(): Promise<void> {
    this.store.clear()
  }
}

// ─── Redis backend ────────────────────────────────────────────────────────────

const INVALIDATE_CHANNEL = 'cache:invalidate'

export class RedisBackend implements CacheBackend {
  /**
   * Ana client: GET / SETEX / DEL / PUBLISH
   * Sub client:  SUBSCRIBE (ayrı bağlantı — Redis protokol gereği)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sub: any = null

  /** Local mirror — cross-instance invalidation için pub/sub mesajı gelince buradan da sil */
  private localMap = new Map<string, unknown>()

  private redisUrl: string

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl
  }

  async init(): Promise<void> {
    // Lazy import — REDIS_URL set ise yükle
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Redis } = await import('ioredis')
    this.client = new Redis(this.redisUrl)
    this.sub = new Redis(this.redisUrl)

    // Cross-instance invalidation: başka instance'dan gelen DEL mesajını dinle
    await this.sub.subscribe(INVALIDATE_CHANNEL)
    this.sub.on('message', (channel: string, message: string) => {
      if (channel === INVALIDATE_CHANNEL) {
        this.localMap.delete(message)
      }
    })
  }

  async get(key: string): Promise<unknown> {
    // Önce lokal Map'e bak (set sonrası write-through önbellekleme)
    if (this.localMap.has(key)) {
      return this.localMap.get(key)
    }
    const raw: string | null = await this.client.get(key)
    if (raw === null) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value)
    await this.client.setex(key, ttlSeconds, serialized)
    // Write-through: lokal Map'e de yaz (aynı instance'da tekrar Redis'e gitme)
    this.localMap.set(key, value)
  }

  async invalidate(key: string): Promise<void> {
    await this.client.del(key)
    this.localMap.delete(key)
    await this.client.publish(INVALIDATE_CHANNEL, key)
  }

  async health(): Promise<'connected' | 'disconnected'> {
    if (!this.client) return 'disconnected'
    return 'connected'
  }

  async shutdown(): Promise<void> {
    this.localMap.clear()
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
    if (this.sub) {
      await this.sub.quit()
      this.sub = null
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * createCache() — REDIS_URL ortam değişkenine göre doğru backend seçer.
 * Test ortamında birden fazla izole instance oluşturulabilmesi için
 * factory fonksiyon olarak dışa aktarılır.
 */
export function createCache(): CacheBackend {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    return new RedisBackend(redisUrl)
  }
  return new InMemoryBackend()
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/**
 * Uygulama geneli tek cache instance'ı.
 * `app.ts` / `index.ts`'de lifecycle:
 *   await cache.init()    // startup
 *   await cache.shutdown() // SIGTERM/SIGINT
 */
const cache = createCache()

export default cache
