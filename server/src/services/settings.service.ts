import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'

export const settingsService = {
  // Birimler
  async getBirimler() {
    const { data, error } = await supabaseAdmin
      .from('birimler')
      .select('*')
      .order('ad')
    if (error) {
      logger.error('Birim listeleme hatası:', error)
      throw error
    }
    return data
  },

  async createBirim(body: any) {
    // Strip proje_id if it exists to avoid DB errors for global tables
    const { proje_id, ...cleanBody } = body
    const { data, error } = await supabaseAdmin
      .from('birimler')
      .insert([cleanBody])
      .select()

    if (error) {
      logger.error('Birim oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu birim zaten kayıtlı')
      throw error
    }
    return data ? data[0] : null
  },

  async deleteBirim(id: string) {
    const { error } = await supabaseAdmin
      .from('birimler')
      .delete()
      .eq('id', id)
    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Bu birime bağlı pozlar veya iş kalemleri var, silemezsiniz.')
      throw error
    }
  },

  // Pozlar
  async getPozlar() {
    const { data, error } = await supabaseAdmin
      .from('pozlar')
      .select('*, birimler(ad)')
      .order('poz_no')
    if (error) throw error
    return data
  },

  async createPoz(body: any) {
    const { proje_id, ...cleanBody } = body
    const { data, error } = await supabaseAdmin
      .from('pozlar')
      .insert([cleanBody])
      .select('*, birimler(ad)')

    if (error) {
      logger.error('Poz oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu poz no zaten kayıtlı')
      throw error
    }
    return data ? data[0] : null
  },

  async updatePoz(id: string, body: any) {
    const { data, error } = await supabaseAdmin
      .from('pozlar')
      .update(body)
      .eq('id', id)
      .select('*, birimler(ad)')
      .single()
    if (error) throw error
    return data
  },

  async deletePoz(id: string) {
    const { error } = await supabaseAdmin
      .from('pozlar')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}
