import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
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
      if (typeof config.data === 'object' && !config.data?.proje_id && !config.data?.projeId) {
        config.data = { ...config.data, proje_id: activeProjectId }
      }
    }
  }

  return config
})

// Hata interceptor: server response body'yi (varsa) reject eder; aksi halde AxiosError.
// 401'de agresif signOut tetiklemiyoruz — AuthContext yönetiyor.
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error.response?.data || error)
)

export const postPayment = (data: any) => api.post('/cari-hareketler/payment', data)
export const payCheck = (id: string, data: any) => api.patch(`/cekler/${id}/pay`, data)

export default api
