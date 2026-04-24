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
  const activeProjectId = localStorage.getItem('activeProjectId')
  const isProjeEndpoint = config.url?.includes('/projeler')
  const isGlobalEndpoint = config.url?.includes('/firmalar') || config.url?.includes('/banka') || config.url?.includes('/settings')
  const isSubResourceWithoutProject = config.url?.includes('/is-kalemleri') || config.url?.includes('/odeme-plani')

  if (activeProjectId && !isProjeEndpoint) {
    if (config.method === 'get' || config.method === 'delete') {
      if (!config.params?.proje_id) {
        config.params = { ...config.params, proje_id: activeProjectId }
      }
    } else if (!isGlobalEndpoint && !isSubResourceWithoutProject) {
      if (typeof config.data === 'object' && !config.data?.proje_id) {
        config.data = { ...config.data, proje_id: activeProjectId }
      }
    }
  }

  return config
})

// Hata interceptor - hataları logla (401'de agresif signOut yapma)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API]', error.response?.status, error.response?.data || error.message)
    return Promise.reject(error.response?.data || error)
  }
)

export const postPayment = (data: any) => api.post('/cari-hareketler/payment', data)
export const payCheck = (id: string, data: any) => api.patch(`/cekler/${id}/pay`, data)

export default api
