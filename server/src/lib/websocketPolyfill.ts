// @supabase/supabase-js 2.106+ ile gelen realtime-js, `new SupabaseClient`
// constructor'unda WebSocket constructor'unu EAGER cozer
// (RealtimeClient._initializeOptions -> WebSocketFactory.getWebSocketConstructor).
// Node < 22'de (orn. CI Node 20, bazi prod runtime'lar) global WebSocket yoktur →
// getWebSocketConstructor throw eder ve client olusturan her modul
// (config/supabase.ts, middleware/auth.ts) IMPORT ANINDA patlar.
//
// Backend Supabase realtime KULLANMAZ; bu throw'u onlemek icin global WebSocket'i
// `ws` paketi ile saglariz (realtime-js once globalThis.WebSocket'e bakar, bulunca
// throw etmez). Node 22+ zaten native global WebSocket'e sahip — o durumda override
// etmeyiz. Bu modul, client olusturan herhangi bir modulden ONCE import edilmelidir.
import WebSocket from 'ws'

const g = globalThis as unknown as { WebSocket?: unknown }
if (typeof g.WebSocket === 'undefined') {
  g.WebSocket = WebSocket
}

export {}
