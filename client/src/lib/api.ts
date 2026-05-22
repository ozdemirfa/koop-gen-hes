import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  // Sprint 20260520-perf hotfix: 30s timeout. Render free tier cold start
  // ~30-60s sürebilir → API bloklayıcı bir await zincirine düşerse UI sonsuza
  // dek <Spin /> gösterir. 30s sonra abort + sessizce reject (caller catch'le
  // veya AuthContext fire-and-forget ile yutsun).
  timeout: 30_000,
  // Content-Type'ı global vermiyoruz: axios'un default transformRequest'i
  // plain object → application/json, FormData → multipart/form-data (browser
  // boundary'yi otomatik ekler) ataması yapar. Global JSON header FormData
  // upload'larında body'yi JSON.stringify edip File'ları kaybediyordu
  // (server `{file: {}}` görüyor).
})

// Her istekte Supabase session token'ını ve aktif proje ID'sini ekle
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }

  // Aktif proje ID'sini ekle
  let activeProjectId = localStorage.getItem('activeProjectId')
  
  // "undefined" veya "null" string'lerini temizle
  if (activeProjectId === 'undefined' || activeProjectId === 'null') {
    activeProjectId = null
  }

  const isProjeEndpoint = config.url?.includes('/projeler')
  const isGlobalEndpoint = config.url?.includes('/firmalar') || config.url?.includes('/settings')
  const isSubResourceWithoutProject = config.url?.includes('/is-kalemleri')

  if (activeProjectId && activeProjectId.length === 36 && !isProjeEndpoint && !isGlobalEndpoint && !isSubResourceWithoutProject) {
    if (config.method === 'get' || config.method === 'delete') {
      // Zaten projeId veya proje_id gönderilmişse müdahale etme
      if (!config.params?.proje_id && !config.params?.projeId) {
        config.params = { ...config.params, proje_id: activeProjectId }
      }
    } else if (config.method === 'post' || config.method === 'put' || config.method === 'patch') {
      // FormData/Blob/File body'lerine dokunma: spread işlemi enumerable
      // own property bulamaz ve içeriği siler. Bu tip body'lerde proje_id
      // gerekiyorsa caller formData.append('proje_id', ...) ile eklesin.
      const isMultipart =
        config.data instanceof FormData ||
        config.data instanceof Blob ||
        config.data instanceof File
      if (!isMultipart && typeof config.data === 'object' && config.data !== null && !config.data?.proje_id && !config.data?.projeId) {
        config.data = { ...config.data, proje_id: activeProjectId }
      }
    }
  }

  return config
})

// Hata interceptor: server response body'yi (varsa) reject eder; aksi halde AxiosError.
// 401'de agresif signOut tetiklemiyoruz — AuthContext yönetiyor.
// Caller'lar HTTP status'a erişebilsin diye `statusCode` non-enumerable olarak ekleniyor
// (JSON.stringify görmüyor, runtime'da err.statusCode okunabiliyor — BUG-001 fix).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data
    const status = error.response?.status
    if (data && typeof data === 'object' && typeof status === 'number') {
      Object.defineProperty(data, 'statusCode', {
        value: status,
        enumerable: false,
        writable: false,
        configurable: false,
      })
      return Promise.reject(data)
    }
    return Promise.reject(error)
  }
)

export const postPayment = (data: any) => api.post('/cari-hareketler/payment', data)
export const payCheck = (id: string, data: any) => api.patch(`/cekler/${id}/pay`, data)

export default api
