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
  const isProjeEndpoint = config.url?.startsWith('/projeler') || config.url?.includes('/serefiye') || config.url?.includes('/yillik-plan')

  if (activeProjectId && !isProjeEndpoint) {
    if (config.method === 'get' || config.method === 'delete') {
      config.params = { ...config.params, proje_id: activeProjectId }
    } else {
      config.data = { ...config.data, proje_id: activeProjectId }
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

export default api
