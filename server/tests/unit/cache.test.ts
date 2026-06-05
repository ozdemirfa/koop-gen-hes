/**
 * TDD: cache.ts — generic hot-swap cache wrapper
 *
 * Davranışlar:
 *  - REDIS_URL yoksa → in-memory Map backend (graceful degradation)
 *  - REDIS_URL varsa  → RedisBackend (ioredis mock ile)
 *  - TTL expiry in-memory
 *  - invalidate(key) → lokal cache siler + Redis pub/sub yayınlar
 *  - SUBSCRIBE cache:invalidate → lokal Map.delete cross-instance
 *  - init/shutdown lifecycle — connection leak yok
 *  - health() → 'disabled' | 'connected' | 'disconnected'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── In-memory backend tests (REDIS_URL unset) ────────────────────────────────

describe('cache — in-memory backend (REDIS_URL unset)', () => {
  let cache: Awaited<ReturnType<typeof import('../../src/lib/cache').createCache>>

  beforeEach(async () => {
    // REDIS_URL env sıfırla
    delete process.env.REDIS_URL
    // Her test için taze instance (module reset değil, createCache factory kullan)
    const mod = await import('../../src/lib/cache')
    cache = mod.createCache()
    await cache.init()
  })

  afterEach(async () => {
    await cache.shutdown()
  })

  it('get returns undefined for missing key', async () => {
    const val = await cache.get('missing-key')
    expect(val).toBeUndefined()
  })

  it('set then get returns stored value', async () => {
    await cache.set('key1', { offline_mode: true }, 60)
    const val = await cache.get('key1')
    expect(val).toEqual({ offline_mode: true })
  })

  it('set overwrites previous value', async () => {
    await cache.set('key1', 'first', 60)
    await cache.set('key1', 'second', 60)
    const val = await cache.get('key1')
    expect(val).toBe('second')
  })

  it('TTL expiry — expired entry returns undefined', async () => {
    await cache.set('exp-key', 'expires', 0) // ttl=0 → immediate expiry
    const val = await cache.get('exp-key')
    expect(val).toBeUndefined()
  })

  it('non-expired entry survives (ttl=9999)', async () => {
    await cache.set('long-key', 'alive', 9999)
    const val = await cache.get('long-key')
    expect(val).toBe('alive')
  })

  it('invalidate removes key from cache', async () => {
    await cache.set('del-key', 'hello', 60)
    await cache.invalidate('del-key')
    const val = await cache.get('del-key')
    expect(val).toBeUndefined()
  })

  it('invalidate on missing key does not throw', async () => {
    await expect(cache.invalidate('no-such-key')).resolves.not.toThrow()
  })

  it('health returns "disabled" (no redis)', async () => {
    expect(await cache.health()).toBe('disabled')
  })

  it('multiple keys are independent', async () => {
    await cache.set('a', 1, 60)
    await cache.set('b', 2, 60)
    await cache.invalidate('a')
    expect(await cache.get('a')).toBeUndefined()
    expect(await cache.get('b')).toBe(2)
  })
})

// ─── Redis backend tests (REDIS_URL set, ioredis mocked) ─────────────────────

// ioredis mock factory — her test için taze nesne
function makeRedisMock() {
  const store = new Map<string, string>()
  const subscribers = new Map<string, Array<(channel: string, message: string) => void>>()

  const mock = {
    // GET
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    // SETEX
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
    // DEL
    del: vi.fn(async (key: string) => {
      const deleted = store.delete(key)
      return deleted ? 1 : 0
    }),
    // PUBLISH
    publish: vi.fn(async (_channel: string, _message: string) => 1),
    // SUBSCRIBE (pub mock ayrı duplicate connection — aynı mock'u paylaşıyoruz)
    subscribe: vi.fn(async (channel: string) => {
      if (!subscribers.has(channel)) subscribers.set(channel, [])
    }),
    // event emitter simulasyonu
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'message') {
        // subscribers'a ekle
        const all = subscribers.get('*') ?? []
        all.push(listener as (channel: string, message: string) => void)
        subscribers.set('*', all)
      }
    }),
    quit: vi.fn(async () => 'OK'),
    // Test helper: mesaj simule et
    _emit: (channel: string, message: string) => {
      const listeners = subscribers.get('*') ?? []
      listeners.forEach(fn => fn(channel, message))
    },
    // expose store for assertions
    _store: store,
  }
  return mock
}

type RedisMock = ReturnType<typeof makeRedisMock>

describe('cache — Redis backend (REDIS_URL set, ioredis mocked)', () => {
  let redisMock: RedisMock
  let subMock: RedisMock
  let cache: Awaited<ReturnType<typeof import('../../src/lib/cache').createCache>>

  beforeEach(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'

    redisMock = makeRedisMock()
    subMock = makeRedisMock()

    // ioredis'i mock et — dynamic import yolunu intercept et
    vi.doMock('ioredis', () => {
      let callCount = 0
      // vitest 4: `new`'lenen vi.fn() mock'unun implementation'ı normal `function`
      // olmalı (arrow function constructor olamaz → TypeError).
      const RedisCtor = vi.fn().mockImplementation(function () {
        // İlk çağrı ana client, ikincisi subscriber
        callCount++
        return callCount === 1 ? redisMock : subMock
      })
      return {
        // named export: `const { Redis } = await import('ioredis')`
        Redis: RedisCtor,
        // default export de sağla (geriye uyumluluk)
        default: RedisCtor,
      }
    })

    const { createCache } = await import('../../src/lib/cache')
    cache = createCache()
    await cache.init()
  })

  afterEach(async () => {
    await cache.shutdown()
    delete process.env.REDIS_URL
    vi.doUnmock('ioredis')
    vi.resetModules()
  })

  it('get calls Redis GET and returns parsed value', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ offline_mode: true }))
    const val = await cache.get('offline:proj1')
    expect(redisMock.get).toHaveBeenCalledWith('offline:proj1')
    expect(val).toEqual({ offline_mode: true })
  })

  it('get returns undefined when Redis returns null', async () => {
    redisMock.get.mockResolvedValueOnce(null)
    const val = await cache.get('no-such')
    expect(val).toBeUndefined()
  })

  it('set calls Redis SETEX with correct TTL', async () => {
    await cache.set('offline:proj2', { offline_mode: false }, 30)
    expect(redisMock.setex).toHaveBeenCalledWith(
      'offline:proj2',
      30,
      JSON.stringify({ offline_mode: false }),
    )
  })

  it('invalidate calls Redis DEL + PUBLISH', async () => {
    await cache.invalidate('offline:proj3')
    expect(redisMock.del).toHaveBeenCalledWith('offline:proj3')
    expect(redisMock.publish).toHaveBeenCalledWith('cache:invalidate', 'offline:proj3')
  })

  it('subscribe is called on init for cache:invalidate channel', async () => {
    expect(subMock.subscribe).toHaveBeenCalledWith('cache:invalidate')
  })

  it('receiving cache:invalidate message removes key from local Map', async () => {
    // Önce local Map'e koy (Redis'e direkt set)
    await cache.set('offline:cross', { offline_mode: true }, 30)

    // Simule et: başka instance'dan invalidate mesajı geldi
    subMock._emit('cache:invalidate', 'offline:cross')

    // Local Map'te yok artık; Redis'ten de tekrar okur
    redisMock.get.mockResolvedValueOnce(null)
    const val = await cache.get('offline:cross')
    expect(val).toBeUndefined()
  })

  it('health returns "connected" when redis client exists', async () => {
    const h = await cache.health()
    expect(h).toBe('connected')
  })

  it('shutdown calls quit on both client and subscriber', async () => {
    await cache.shutdown()
    expect(redisMock.quit).toHaveBeenCalled()
    expect(subMock.quit).toHaveBeenCalled()
  })
})

// ─── Singleton (default export) ───────────────────────────────────────────────

describe('cache — default singleton', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL
    vi.resetModules()
  })

  it('default export exposes get/set/invalidate/health/init/shutdown', async () => {
    const mod = await import('../../src/lib/cache')
    const c = mod.default
    expect(typeof c.get).toBe('function')
    expect(typeof c.set).toBe('function')
    expect(typeof c.invalidate).toBe('function')
    expect(typeof c.health).toBe('function')
    expect(typeof c.init).toBe('function')
    expect(typeof c.shutdown).toBe('function')
  })
})
