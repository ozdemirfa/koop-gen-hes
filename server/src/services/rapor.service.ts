import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'

export const raporService = {
  async dashboardOzet(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_dashboard_ozet', {
      p_proje_id: projeId
    });

    if (error) {
      logger.error('fn_dashboard_ozet RPC error', { error, projeId });
      throw error;
    }

    return data;
  },

  async aidatDurumu(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_aidat_durum_ozet', {
      p_proje_id: projeId
    });

    if (error) throw error;

    const result = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0, ...data };
    return result;
  },

  async getMizan(projeId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('get_cari_mizan', { p_proje_id: projeId });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.cari_hesap_id,
      cari_adi: item.cari_adi,
      cari_turu: item.cari_turu,
      toplam_alacak: Number(item.toplam_alacak || 0),
      toplam_borc: Number(item.toplam_borc || 0),
      bakiye: Number(item.bakiye || 0) // alacak - borc
    }));
  },

  async uyeBorcListesi(projeId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('get_cari_mizan', { p_proje_id: projeId });

    if (error) throw error;

    return (data || [])
      .filter((item: any) => item.cari_turu === 'uye' && item.bakiye > 0)
      .map((item: any) => ({
        uye_no: item.uye_no,
        ad: item.ad,
        soyad: item.soyad,
        toplam_borc: item.bakiye,
        bakiye: item.bakiye
      }));
  },

  async aylikRapor(yil: number, ay: number, projeId: string) {
    if (!projeId || projeId === 'undefined') {
      throw new Error('Proje ID zorunludur');
    }

    const { data, error } = await supabaseAdmin.rpc('fn_aylik_rapor_detay', {
      p_proje_id: projeId,
      p_yil: yil,
      p_ay: ay
    });

    if (error) {
      logger.error('fn_aylik_rapor_detay RPC error', { error, projeId, yil, ay });
      throw error;
    }

    return {
      donem: { yil, ay },
      gelirler: data.gelirler || [],
      giderler: data.giderler || [],
      tahsilatlar: data.tahsilatlar || [],
      aidat_tahsilat: data.tahsilatlar || [], // Frontend compatibility
      odemeler: data.odemeler || [],
      toplam_gelir: Number(data.toplam_gelir || 0),
      toplam_gider: Number(data.toplam_gider || 0),
      toplam_tahsilat: Number(data.toplam_tahsilat || 0),
      toplam_aidat_tahsilat: Number(data.toplam_tahsilat || 0),
      toplam_odeme: Number(data.toplam_odeme || 0),
      yaklasan_odemeler: { t: 0, t1: 0, t2: 0 }
    };
  },

  async yillikRapor(yil: number, projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_yillik_rapor_ozet', {
      p_proje_id: projeId,
      p_yil: yil
    });

    if (error) {
      logger.error('fn_yillik_rapor_ozet RPC error', { error, projeId, yil });
      throw error;
    }

    return data;
  },

  async hakedisOzet(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, ara_toplam, hakedis_toplam, net_tutar, sozlesmeler(sozlesme_no, firmalar(unvan))')
      .eq('proje_id', projeId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ozet = {
      toplam_hakedis_sayisi: data?.length || 0,
      taslak: 0,
      onaylanan: 0,
      odenen: 0,
      toplam_matrah: 0,
      toplam_kdvli: 0,
      toplam_net: 0
    };

    data?.forEach(h => {
      ozet.toplam_matrah += Number(h.ara_toplam || 0);
      ozet.toplam_kdvli += Number(h.hakedis_toplam || 0);
      ozet.toplam_net += Number(h.net_tutar || 0);
      if (h.durum === 'taslak') ozet.taslak++;
      if (h.durum === 'onaylandi') ozet.onaylanan++;
      if (h.durum === 'odendi') ozet.odenen++;
    });

    return { ozet, hakedisler: data };
  }
}
