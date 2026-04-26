import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const cariHesapService = {
  async list(query: Record<string, any>) {
    const projeId = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id
    
    // Determine if we need an inner join for filtering by uye_id, firma_id or cari_turu
    const needsInner = !!(query.uye_id || query.firma_id || query.cari_turu);
    const selectStr = needsInner
      ? '*, cari_hesaplar!inner(cari_adi, cari_turu, uye_id, firma_id, proje_id)'
      : '*, cari_hesaplar(cari_adi, cari_turu, uye_id, firma_id, proje_id)';

    let q = supabaseAdmin
      .from('cari_hareketler')
      .select(selectStr)

    if (projeId) q = q.eq('proje_id', projeId)
    
    // Apply filters on the joined cari_hesaplar table
    if (query.uye_id) q = q.eq('cari_hesaplar.uye_id', query.uye_id)
    if (query.firma_id) q = q.eq('cari_hesaplar.firma_id', query.firma_id)
    if (query.cari_turu) q = q.eq('cari_hesaplar.cari_turu', query.cari_turu)

    // Other filters
    if (query.islem_turu) q = q.eq('islem_turu', query.islem_turu)
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

    // Eşleşmemiş cari hareketleri: banka_hareketleri.eslesen_cari_hareket_id ile referanslanmayanlar
    if (query.eslesmemis === 'true' || query.eslesmemis === true) {
      const { data: eslesenler, error: eslesError } = await supabaseAdmin
        .from('banka_hareketleri')
        .select('eslesen_cari_hareket_id')
        .not('eslesen_cari_hareket_id', 'is', null)

      if (eslesError) throw eslesError

      const eslesenIds = (eslesenler || [])
        .map(r => r.eslesen_cari_hareket_id)
        .filter(Boolean) as string[]

      if (eslesenIds.length > 0) {
        q = q.not('id', 'in', `(${eslesenIds.join(',')})`)
      }
    }

    const { data, error } = await q.order('tarih', { ascending: true })
    if (error) throw error
    return data
  },

  async listAccounts(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('cari_hesaplar')
      .select('*')

    const proje_id = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id
    const cari_turu = Array.isArray(query.cari_turu) ? query.cari_turu[0] : query.cari_turu

    if (proje_id) q = q.eq('proje_id', proje_id)
    if (cari_turu) q = q.eq('cari_turu', cari_turu)

    const { data, error } = await q.order('cari_adi', { ascending: true })
    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async createPayment(paymentData: {
    proje_id: string,
    cari_hesap_id: string,
    islem_turu: 'gelen_odeme' | 'giden_odeme',
    odeme_turu: 'nakit' | 'banka' | 'cek' | 'kredi_karti',
    tutar: number,
    tarih: string,
    aciklama?: string,
    belge_no?: string,
    banka_hesap_id?: string,
    cek_id?: string,
    vade_tarihi?: string,
    banka?: string,
    sube?: string,
    kaynak_tipi?: string,
    kaynak_id?: string
  }) {
    const { 
      islem_turu, 
      tutar, 
      odeme_turu, 
      banka_hesap_id, 
      cek_id, 
      vade_tarihi,
      banka,
      sube,
      ...rest 
    } = paymentData;

    // 1. Çek Entegrasyonu Özel Durumu
    if (odeme_turu === 'cek') {
      let finalCekId = cek_id;
      
      if (!finalCekId) {
        // Cari hesaptan firma_id'yi bul (Cekler tablosunda firma_id zorunludur)
        const { data: cari } = await supabaseAdmin
          .from('cari_hesaplar')
          .select('firma_id')
          .eq('id', rest.cari_hesap_id)
          .single();

        if (!cari?.firma_id) {
          throw new ApiError(400, 'Çek kaydı için geçerli bir firma cari hesabı gereklidir.');
        }

        const { data: newCek, error: cekError } = await supabaseAdmin
          .from('cekler')
          .insert([{
            proje_id: rest.proje_id,
            firma_id: cari.firma_id,
            cek_no: rest.belge_no || 'YENI-CEK',
            banka: banka || 'Belirtilmedi',
            sube: sube || '',
            tutar: tutar,
            vade_tarihi: vade_tarihi || new Date().toISOString().split('T')[0],
            durum: 'beklemede',
            aciklama: rest.aciklama
          }])
          .select()
          .single();

        if (cekError) throw cekError;
        
        // Çek ödendiğinde cari hareket atılacağı için burada cari_hareketler'e kayıt ATMIYORUZ.
        return { 
          ...newCek,
          is_cek: true,
          message: 'Çek kaydı oluşturuldu. Cari hareket çek ödendiğinde oluşacaktır.' 
        };
      } else {
        // Zaten cek_id gelmişse (mevcut bir çek seçilmişse)
        return { id: finalCekId, message: 'Mevcut çek ilişkilendirildi.' };
      }
    }

    // --- Normal İşleyiş (Nakit, Banka, Kredi Kartı) ---
    let borc = 0;
    let alacak = 0;

    if (islem_turu === 'gelen_odeme') {
      borc = tutar;
    } else {
      alacak = tutar;
    }

    // 2. Cari Hareketi Oluştur
    const { data: hareket, error: hareketError } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([{
        ...rest,
        islem_turu,
        odeme_turu,
        odeme_yontemi: odeme_turu, // Senkronizasyon için ekledik
        borc,
        alacak,
        banka_hesap_id
      }])
      .select()
      .single();

    if (hareketError) throw hareketError;

    // 3. Banka Hareketi Entegrasyonu
    if (odeme_turu === 'banka' && banka_hesap_id) {
      const { data: bankaHareketi, error: bankaError } = await supabaseAdmin
        .from('banka_hareketleri')
        .insert([{
          banka_hesap_id,
          proje_id: rest.proje_id, // Proje ID'sini ekle
          tarih: rest.tarih,
          tutar: tutar,
          islem_tipi: islem_turu === 'gelen_odeme' ? 'gelir' : 'gider',
          aciklama: rest.aciklama,
          eslesen_cari_hareket_id: hareket.id,
          eslesti: true
        }])
        .select()
        .single();

      if (bankaError) throw bankaError;

      // Cari harekete banka hareketi ID'sini geri yaz
      if (bankaHareketi) {
        await supabaseAdmin
          .from('cari_hareketler')
          .update({ banka_hareket_id: bankaHareketi.id })
          .eq('id', hareket.id);
        
        hareket.banka_hareket_id = bankaHareketi.id;
      }
    }

    return hareket;
  },

  async undoClosure(id: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_payment_match', {
      p_movement_id: id
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  async undoHakedisClosure(id: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_hakedis_closure', {
      p_hakedis_id: id
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  async performFifoClosure(projeId: string) {
    try {
      // 1. Üyeler için FIFO (gelen_odeme -> aidat)
      await this.fifoClosureForMembers(projeId);
      
      // 2. Firmalar için FIFO (giden_odeme -> hakedis)
      await this.fifoClosureForFirms(projeId);
      
      return { success: true, message: 'Hesap kapamaları tamamlandı.' };
    } catch (err) {
      console.error('FIFO Closure Error:', err);
      throw err;
    }
  },

  async fifoClosureForMembers(projeId: string) {
    // Tüm aidatları ve onların ödenme durumlarını çek (View kullanmak en kolayı)
    const { data: aidatlar } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('id, uye_id, toplam_borc, dinamik_odenen_tutar, durum')
      .eq('proje_id', projeId)
      .neq('durum', 'odendi')
      .neq('durum', 'iptal')
      .order('son_odeme_tarihi', { ascending: true });

    if (!aidatlar || aidatlar.length === 0) return;

    // Üye bazlı grupla
    const memberAidats: Record<string, any[]> = {};
    aidatlar.forEach(a => {
      if (a.uye_id) {
        if (!memberAidats[a.uye_id]) memberAidats[a.uye_id] = [];
        memberAidats[a.uye_id].push(a);
      }
    });

    for (const uyeId in memberAidats) {
      const { data: cari } = await supabaseAdmin
        .from('cari_hesaplar')
        .select('id')
        .eq('uye_id', uyeId)
        .eq('proje_id', projeId)
        .single();

      if (!cari) continue;

      // Bu üyenin boşta kalan tahsilatlarını çek
      const { data: memberPayments } = await supabaseAdmin
        .from('cari_hareketler')
        .select('*')
        .eq('proje_id', projeId)
        .eq('cari_hesap_id', cari.id)
        .eq('islem_turu', 'gelen_odeme')
        .is('kaynak_id', null)
        .order('tarih', { ascending: true });

      if (!memberPayments || memberPayments.length === 0) continue;

      let aidatIndex = 0;
      const currentAidats = memberAidats[uyeId];

      for (const payment of memberPayments) {
        let paymentAmount = Number(payment.borc);
        
        while (paymentAmount > 0 && aidatIndex < currentAidats.length) {
          const aidat = currentAidats[aidatIndex];
          const remainingDebt = Number(aidat.toplam_borc) - Number(aidat.dinamik_odenen_tutar);

          if (remainingDebt <= 0) {
            aidatIndex++;
            continue;
          }

          const matchAmount = Math.min(paymentAmount, remainingDebt);

          if (paymentAmount > remainingDebt) {
            // Ödeme aidattan büyükse: Kaydı böl
            // Mevcut kaydı aidat miktarı kadar güncelle ve bağla
            await supabaseAdmin.from('cari_hareketler').update({
              borc: matchAmount,
              kaynak_tipi: 'aidat',
              kaynak_id: aidat.id
            }).eq('id', payment.id);

            // Kalan tutar için yeni (unlinked) kayıt oluştur
            const { data: newPart } = await supabaseAdmin.from('cari_hareketler').insert([{
              ...payment,
              id: undefined,
              created_at: undefined,
              borc: paymentAmount - matchAmount,
              kaynak_tipi: null,
              kaynak_id: null
            }]).select().single();

            // Döngüye yeni part ile devam et (Eğer gerekirse)
            paymentAmount -= matchAmount;
            aidat.dinamik_odenen_tutar = Number(aidat.dinamik_odenen_tutar) + matchAmount;
            
            // Aidat kapandıysa bir sonrakine geç
            if (Number(aidat.dinamik_odenen_tutar) >= Number(aidat.toplam_borc)) {
               await supabaseAdmin.from('aidatlar').update({ durum: 'odendi' }).eq('id', aidat.id);
               aidatIndex++;
            }
            
            // Bu ödeme kaydı bitti, ama sanal olarak devam ediyoruz (yeni oluşturulan parça bir sonraki loop'ta veya bu loop içinde eritilecek)
          } else {
            // Ödeme aidata tam yetiyor veya eksik kalıyorsa: Direkt bağla
            await supabaseAdmin.from('cari_hareketler').update({
              kaynak_tipi: 'aidat',
              kaynak_id: aidat.id
            }).eq('id', payment.id);

            aidat.dinamik_odenen_tutar = Number(aidat.dinamik_odenen_tutar) + matchAmount;
            if (Number(aidat.dinamik_odenen_tutar) >= Number(aidat.toplam_borc)) {
               await supabaseAdmin.from('aidatlar').update({ durum: 'odendi' }).eq('id', aidat.id);
               aidatIndex++;
            }
            paymentAmount = 0;
          }
        }
      }
    }
  },

  async fifoClosureForFirms(projeId: string) {
    // 1. Onaylanmış hakedişleri çek
    const { data: hakedisler } = await supabaseAdmin
      .from('hakedisler')
      .select('id, sozlesmeler!inner(firma_id), hakedis_toplam, hakedis_no, durum')
      .eq('proje_id', projeId)
      .in('durum', ['onaylandi', 'odendi'])
      .order('created_at', { ascending: true });

    if (!hakedisler || hakedisler.length === 0) return;

    // Firma bazlı grupla
    const firmaHakedis: Record<string, any[]> = {};
    hakedisler.forEach(h => {
      const fId = (h.sozlesmeler as any).firma_id;
      if (!firmaHakedis[fId]) firmaHakedis[fId] = [];
      firmaHakedis[fId].push(h);
    });

    for (const firmaId in firmaHakedis) {
      const { data: cari } = await supabaseAdmin
        .from('cari_hesaplar')
        .select('id')
        .eq('firma_id', firmaId)
        .eq('proje_id', projeId)
        .single();

      if (!cari) continue;

      // Bu firmanın boşta kalan giden ödemelerini çek
      const { data: firmaPayments } = await supabaseAdmin
        .from('cari_hareketler')
        .select('*')
        .eq('proje_id', projeId)
        .eq('cari_hesap_id', cari.id)
        .eq('islem_turu', 'giden_odeme')
        .is('kaynak_id', null)
        .order('tarih', { ascending: true });

      if (!firmaPayments || firmaPayments.length === 0) continue;

      let hakedisIndex = 0;
      const currentHakedisler = firmaHakedis[firmaId];

      // Hakedişlerin ödenen kısımlarını hesapla
      for (const h of currentHakedisler) {
        const { data: linkedMovements } = await supabaseAdmin
          .from('cari_hareketler')
          .select('alacak')
          .eq('kaynak_tipi', 'hakedis')
          .eq('kaynak_id', h.id);
        h.odenen = (linkedMovements || []).reduce((s, m) => s + Number(m.alacak), 0);
      }

      for (const payment of firmaPayments) {
        let paymentAmount = Number(payment.alacak);

        while (paymentAmount > 0 && hakedisIndex < currentHakedisler.length) {
          const h = currentHakedisler[hakedisIndex];
          const remainingDebt = Number(h.hakedis_toplam) - Number(h.odenen);

          if (remainingDebt <= 0) {
            hakedisIndex++;
            continue;
          }

          const matchAmount = Math.min(paymentAmount, remainingDebt);

          if (paymentAmount > remainingDebt) {
            // Ödeme hakedişten büyükse: Kaydı böl
            await supabaseAdmin.from('cari_hareketler').update({
              alacak: matchAmount,
              kaynak_tipi: 'hakedis',
              kaynak_id: h.id
            }).eq('id', payment.id);

            await supabaseAdmin.from('cari_hareketler').insert([{
              ...payment,
              id: undefined,
              created_at: undefined,
              alacak: paymentAmount - matchAmount,
              kaynak_tipi: null,
              kaynak_id: null
            }]);

            paymentAmount -= matchAmount;
            h.odenen += matchAmount;
            if (h.odenen >= Number(h.hakedis_toplam)) {
              await supabaseAdmin.from('hakedisler').update({ durum: 'odendi' }).eq('id', h.id);
              hakedisIndex++;
            }
          } else {
            // Ödeme hakedişe tam yetiyor veya eksikse
            await supabaseAdmin.from('cari_hareketler').update({
              kaynak_tipi: 'hakedis',
              kaynak_id: h.id
            }).eq('id', payment.id);

            h.odenen += matchAmount;
            if (h.odenen >= Number(h.hakedis_toplam)) {
              await supabaseAdmin.from('hakedisler').update({ durum: 'odendi' }).eq('id', h.id);
              hakedisIndex++;
            }
            paymentAmount = 0;
          }
        }
      }
    }
  }
}
