import React, { useState, useEffect, useMemo } from 'react'
import { Card, Descriptions, Table, Button, InputNumber, Tag, Row, Col, Statistic, Space, Popconfirm, Select, Modal, Typography, App, Empty } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckOutlined, SaveOutlined, DownloadOutlined, ArrowLeftOutlined, PlusOutlined, DeleteOutlined, RollbackOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'

const { Text } = Typography

interface HakedisKalemi {
  id: string
  is_kalemi_id: string
  onceki_miktar: number
  bu_ay_miktar: number
  toplam_miktar: number
  birim_fiyat: number
  kdv_orani: number
  bu_ay_tutar: number
  toplam_tutar: number
  sozlesme_is_kalemleri?: {
    poz_no?: string
    tanim: string
    birim: string
    miktar: number
    kdv_orani: number
  }
}

interface EditableKalem {
  is_kalemi_id: string
  onceki_miktar: number
  bu_ay_miktar: number
  birim_fiyat: number
  kdv_orani: number
  poz_no?: string
  tanim: string
  birim: string
  sozlesme_miktar: number
}

const durumRenk: Record<string, string> = {
  taslak: 'default',
  onaylandi: 'blue',
  odendi: 'green',
  iptal: 'red',
}

const durumLabel: Record<string, string> = {
  taslak: 'Taslak',
  onaylandi: 'Onaylandı',
  odendi: 'Ödendi',
  iptal: 'İptal',
}

export const HakedisDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const [editableKalemler, setEditableKalemler] = useState<EditableKalem[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [selectedKalemId, setSelectedKalemId] = useState<string | undefined>()
  const [irsaliyeModalOpen, setIrsaliyeModalOpen] = useState(false)
  const [selectedIrsaliyeIds, setSelectedIrsaliyeIds] = useState<React.Key[]>([])

  const { data: hakedis, isLoading } = useQuery({
    queryKey: ['hakedis', id, activeProject?.id],
    queryFn: async () => {
      // proje_id açıkça geçilir + enabled guard: aktif proje hidre olmadan istek
      // atılırsa interceptor proje_id ekleyemez → backend "proje_id zorunludur" 400
      // (hidrasyon race). Bkz #158 gated-route race.
      const { data } = await api.get(`/hakedisler/${id}`, { params: { proje_id: activeProject?.id } })
      return data.data
    },
    enabled: !!id && !!activeProject?.id,
  })

  const isTaslak = hakedis?.durum === 'taslak'

  // Kalemleri editable state'e çevir
  useEffect(() => {
    if (hakedis?.hakedis_kalemleri) {
      const kalemler = hakedis.hakedis_kalemleri.map((k: HakedisKalemi) => ({
        is_kalemi_id: k.is_kalemi_id,
        onceki_miktar: Number(k.onceki_miktar),
        bu_ay_miktar: Number(k.bu_ay_miktar),
        birim_fiyat: Number(k.birim_fiyat),
        kdv_orani: Number(k.kdv_orani || k.sozlesme_is_kalemleri?.kdv_orani || 20),
        poz_no: k.sozlesme_is_kalemleri?.poz_no,
        tanim: k.sozlesme_is_kalemleri?.tanim || '',
        birim: k.sozlesme_is_kalemleri?.birim || '',
        sozlesme_miktar: Number(k.sozlesme_is_kalemleri?.miktar || 0),
      }))
      setEditableKalemler(kalemler)
      setHasChanges(false)
    }
  }, [hakedis])

  // Sözleşme iş kalemlerini getir (Ekleme için)
  const { data: sozlesmeIsKalemleri } = useQuery({
    queryKey: ['sozlesme-kalemleri', hakedis?.sozlesme_id],
    queryFn: async () => {
      const { data } = await api.get(`/sozlesmeler/${hakedis.sozlesme_id}`)
      return data.data.sozlesme_is_kalemleri as any[]
    },
    enabled: !!hakedis?.sozlesme_id && isTaslak
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const kalemler = editableKalemler.map(k => ({
        is_kalemi_id: k.is_kalemi_id,
        bu_ay_miktar: k.bu_ay_miktar,
        birim_fiyat: k.birim_fiyat,
        kdv_orani: k.kdv_orani,
        onceki_miktar: k.onceki_miktar
      }))
      const { data } = await api.post(`/hakedisler/${id}/kalemler`, { kalemler })
      return data
    },
    onSuccess: () => {
      message.success('Hakediş kalemleri kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      setHasChanges(false)
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Eğer değişiklik varsa önce kaydet
      if (hasChanges) {
        await saveMutation.mutateAsync()
      }
      const { data } = await api.put(`/hakedisler/${id}/onayla`)
      return data
    },
    onSuccess: () => {
      message.success('Hakediş onaylandı')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const unapproveMutation = useMutation({
    mutationFn: async () => {
      return api.put(`/hakedisler/${id}/onay-iptal`)
    },
    onSuccess: () => {
      message.success('Hakediş onayı iptal edildi, tekrar düzenlenebilir.')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'İşlem başarısız')),
  })

  // Alternatif A: hakedişin sözleşme firmasına ait açık irsaliyeler (hakedis_id NULL)
  const firmaId = hakedis?.sozlesmeler?.firma_id
  const projeId = hakedis?.proje_id
  const { data: acikIrsaliyeler, isLoading: irsaliyelerLoading } = useQuery({
    queryKey: ['acik-irsaliyeler', firmaId, projeId],
    queryFn: async () => {
      const { data } = await api.get('/malzeme-teslimleri', {
        params: { firma_id: firmaId, proje_id: projeId, has_hakedis: 'false', limit: 200 }
      })
      return data.data as Array<{
        id: string
        irsaliye_no?: string
        teslim_tarihi: string
        teslim_alan?: string
        irsaliye_kalemleri: Array<{ id: string; malzeme_adi: string; birim: string; miktar: number }>
      }>
    },
    enabled: !!firmaId && !!projeId && irsaliyeModalOpen,
  })

  const attachIrsaliyelerMutation = useMutation({
    mutationFn: async (irsaliye_ids: string[]) => {
      const { data } = await api.post(`/hakedisler/${id}/irsaliyeler`, { irsaliye_ids })
      return data
    },
    onSuccess: () => {
      message.success(`${selectedIrsaliyeIds.length} irsaliye hakedişe bağlandı`)
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['acik-irsaliyeler'] })
      queryClient.invalidateQueries({ queryKey: ['irsaliyeler'] })
      setIrsaliyeModalOpen(false)
      setSelectedIrsaliyeIds([])
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const detachIrsaliyeMutation = useMutation({
    mutationFn: async (irsaliyeId: string) => {
      const { data } = await api.delete(`/hakedisler/${id}/irsaliyeler/${irsaliyeId}`)
      return data
    },
    onSuccess: () => {
      message.success('İrsaliye bağı kaldırıldı')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['acik-irsaliyeler'] })
      queryClient.invalidateQueries({ queryKey: ['irsaliyeler'] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const handleMiktarChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], bu_ay_miktar: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  const handleFiyatChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], birim_fiyat: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  const handleKdvChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], kdv_orani: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  const handleAddItem = () => {
    const kalem = sozlesmeIsKalemleri?.find(k => k.id === selectedKalemId)
    if (kalem) {
      const alreadyExists = editableKalemler.find(ek => ek.is_kalemi_id === kalem.id)
      if (alreadyExists) {
        message.warning('Bu kalem zaten hakedişe eklenmiş')
        return
      }

      const newKalem: EditableKalem = {
        is_kalemi_id: kalem.id,
        onceki_miktar: 0,
        bu_ay_miktar: 0,
        birim_fiyat: Number(kalem.birim_fiyat),
        kdv_orani: Number(kalem.kdv_orani || 20),
        poz_no: kalem.poz_no,
        tanim: kalem.tanim,
        birim: kalem.birim,
        sozlesme_miktar: Number(kalem.miktar)
      }
      setEditableKalemler([...editableKalemler, newKalem])
      setHasChanges(true)
      setAddModalOpen(false)
      setSelectedKalemId(undefined)
    }
  }

  const handleRemoveItem = (index: number) => {
    const updated = [...editableKalemler]
    updated.splice(index, 1)
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  // Hesaplamalar
  const araToplam = editableKalemler.reduce((sum, k) => sum + k.bu_ay_miktar * k.birim_fiyat, 0)
  const kdvToplam = editableKalemler.reduce((sum, k) => sum + (k.bu_ay_miktar * k.birim_fiyat * k.kdv_orani / 100), 0)
  const hakedisToplam = araToplam + kdvToplam

  const teminatOrani = Number(hakedis?.sozlesmeler?.teminat_orani || 0)
  const stopajOrani = Number(hakedis?.sozlesmeler?.stopaj_orani || 0)
  
  const teminatKesintisi = araToplam * (teminatOrani / 100)
  const stopajKesintisi = araToplam * (stopajOrani / 100)
  const digerKesintiler = Number(hakedis?.diger_kesintiler || 0)
  const netTutar = hakedisToplam - teminatKesintisi - stopajKesintisi - digerKesintiler

  const handleCsvDownload = React.useCallback(() => {
    if (!hakedis) return
    const hakedisNo = hakedis.hakedis_no || id
    downloadCsv(`hakedis-${hakedisNo}`, [
      {
        title: `Hakediş #${hakedisNo} — ${hakedis.sozlesmeler?.firmalar?.unvan || ''}`,
        headers: ['Alan', 'Değer'],
        rows: [
          ['Firma', hakedis.sozlesmeler?.firmalar?.unvan || ''],
          ['Sözleşme', hakedis.sozlesmeler?.konu || ''],
          ['Durum', durumLabel[hakedis.durum] || hakedis.durum],
          ['Dönem', hakedis.donem_baslangic ? dayjs(hakedis.donem_baslangic).format('MM/YYYY') : ''],
          ['Onay Tarihi', hakedis.onay_tarihi ? dayjs(hakedis.onay_tarihi).format('DD.MM.YYYY') : ''],
          ['Açıklama', hakedis.aciklama || ''],
        ],
      },
      {
        title: 'Kesinti Özeti',
        headers: ['Kalem', 'Tutar'],
        rows: [
          ['Hakediş Toplam', hakedisToplam],
          [`Teminat (%${teminatOrani})`, teminatKesintisi],
          [`Stopaj (%${stopajOrani})`, stopajKesintisi],
          ['Diğer Kesintiler', digerKesintiler],
          ['Net Ödenecek', netTutar],
        ],
      },
      {
        title: 'İş Kalemleri',
        headers: ['Poz No', 'Tanım', 'Birim', 'Sözleşme Mik.', 'Önceki Top.', 'Bu Ay Mik.', 'Birim Fiyat', 'Matrah', 'KDV %', 'KDVli Tutar'],
        rows: editableKalemler.map((k) => [
          k.poz_no || '',
          k.tanim,
          k.birim,
          k.sozlesme_miktar,
          k.onceki_miktar,
          k.bu_ay_miktar,
          k.birim_fiyat,
          k.bu_ay_miktar * k.birim_fiyat,
          k.kdv_orani,
          k.bu_ay_miktar * k.birim_fiyat * (1 + k.kdv_orani / 100),
        ]),
      },
      ...(hakedis.irsaliyeler && hakedis.irsaliyeler.length > 0 ? [{
        title: 'Bağlı İrsaliyeler',
        headers: ['Tarih', 'İrsaliye No', 'Teslim Alan', 'Kalemler'],
        rows: hakedis.irsaliyeler.map((i: any) => [
          dayjs(i.teslim_tarihi).format('DD.MM.YYYY'),
          i.irsaliye_no || '',
          i.teslim_alan || '',
          (i.irsaliye_kalemleri || []).map((k: any) => `${k.malzeme_adi} ${k.miktar} ${k.birim}`).join(' | '),
        ]),
      }] : []),
    ], { projectName: activeProject?.proje_adi })
  }, [hakedis, id, editableKalemler, hakedisToplam, teminatOrani, teminatKesintisi, stopajOrani, stopajKesintisi, digerKesintiler, netTutar, activeProject?.proje_adi])

  // Sprint role-system-modernization (PR-C, 2026-05-20) — React #185 fix:
  // `actions` useMemo'sunun dependency array'inde mutation **objelerini**
  // tutmak infinite loop tetikliyordu. `useMutation` her render'da yeni bir
  // result objesi döndürür (mutate referansı bile stable değildir bazı sürümlerde);
  // bu sebeple `actions !== lastActions.current` ref-check'i her render'da
  // true dönüyor → setHeaderActions → re-render → loop → React #185
  // ("Maximum update depth exceeded").
  //
  // Çözüm: dependency array'e yalnızca primitive `isPending` flag'lerini ve
  // stable mutate fonksiyon referanslarını koy. JSX içinde `.mutate()` çağrısı
  // closure üzerinden okunur; her render'da fonksiyon kimliği değişse bile
  // memoize değeri (children + key fingerprint) değişmediği sürece referans
  // sabit kalır.
  //
  // Ayrıca permission gating: PR-C ile `canEdit` (her üye form girişi yapabilir)
  // ve `canDelete` (manager+ onay-iptal/yıkıcı işlemler) ayrıştırıldı.
  const isSaving = saveMutation.isPending
  const isApproving = approveMutation.isPending
  const isUnapproving = unapproveMutation.isPending
  const triggerSave = saveMutation.mutate
  const triggerApprove = approveMutation.mutate
  const triggerUnapprove = unapproveMutation.mutate
  const hakedisDurum = hakedis?.durum
  const hasHakedis = !!hakedis
  const kalemCount = editableKalemler.length

  const actions = useMemo(() => {
    // UX: 3 mutate butonu da her zaman görünür; izinler `disabled` prop'u ile
    // yönetilir. Taslakta Kaydet + Onayla aktif, Geri Al pasif; onaylandıda
    // Kaydet + Onayla pasif, Geri Al aktif (manager+).
    const canSave = isTaslak && kalemCount > 0 && !isSaving && !isApproving && canEdit
    const canApprove = isTaslak && !isSaving && !isApproving && canEdit
    const canUnapprove = hakedisDurum === 'onaylandi' && !isUnapproving && canDelete

    const stateKey = [
      hakedisDurum ?? 'loading',
      canSave ? 'cs' : '',
      canApprove ? 'ca' : '',
      canUnapprove ? 'cu' : '',
      hasChanges ? 'dirty' : 'clean',
      isSaving ? 'saving' : '',
      isApproving ? 'approving' : '',
      isUnapproving ? 'unapproving' : '',
      canEdit ? 'e' : '',
      canDelete ? 'd' : '',
    ].filter(Boolean).join('|')

    return (
    <Space key={`hakedis-actions-${stateKey}`}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/hakedisler')}
        type="text"
      />
      <Button
        icon={<DownloadOutlined />}
        onClick={handleCsvDownload}
        disabled={!hasHakedis}
      >
        CSV İndir
      </Button>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        onClick={() => triggerSave()}
        loading={isSaving}
        disabled={!canSave}
        title={!canEdit ? 'Yetki yok' : undefined}
      >
        Kaydet
      </Button>
      <Popconfirm
        title="Hakediş onayla"
        description={hasChanges ? "Hakediş önce kaydedilecek, sonra onaylanacaktır. Onaylıyor musunuz?" : "Hakediş onaylanacak ve cari hareket oluşturulacak. Onaylıyor musunuz?"}
        onConfirm={() => triggerApprove()}
        okText="Onayla"
        cancelText="Vazgeç"
        disabled={!canApprove}
      >
        <Button
          icon={<CheckOutlined />}
          loading={isApproving || isSaving}
          disabled={!canApprove}
          title={!canEdit ? 'Yetki yok' : undefined}
          style={canApprove ? { backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' } : undefined}
        >
          Onayla
        </Button>
      </Popconfirm>
      <Popconfirm
        title="Hakediş onayı iptal edilecek ve cari hareketi silinecek. Emin misiniz?"
        onConfirm={() => triggerUnapprove()}
        okText="Evet"
        cancelText="Hayır"
        disabled={!canUnapprove}
      >
        <Button
          icon={<RollbackOutlined />}
          loading={isUnapproving}
          disabled={!canUnapprove}
          danger={canUnapprove}
          title={!canDelete ? 'Yetki yok (manager+ gerekli)' : undefined}
        >
          Onaydan Geri Al
        </Button>
      </Popconfirm>
    </Space>
    )
  }, [
    navigate,
    handleCsvDownload,
    isTaslak,
    hakedisDurum,
    hasHakedis,
    hasChanges,
    kalemCount,
    isSaving,
    isApproving,
    isUnapproving,
    triggerSave,
    triggerApprove,
    triggerUnapprove,
    canEdit,
    canDelete,
  ])

  usePageSettings(hakedis ? `Hakediş #${hakedis.hakedis_no}` : 'Hakediş Detayı', actions)

  const columns = [
    { title: 'Poz No', dataIndex: 'poz_no', key: 'poz_no', width: 80 },
    { title: 'Tanım', dataIndex: 'tanim', key: 'tanim' },
    { title: 'Birim', dataIndex: 'birim', key: 'birim', width: 70 },
    {
      title: 'Sözleşme Mik.',
      dataIndex: 'sozlesme_miktar',
      key: 'sozlesme_miktar',
      align: 'right' as const,
      width: 100,
      render: (v: number) => trNumberFormatter(v),
    },
    {
      title: 'Önceki Toplam',
      dataIndex: 'onceki_miktar',
      key: 'onceki_miktar',
      align: 'right' as const,
      width: 110,
      render: (v: number) => trNumberFormatter(v),
    },
    {
      title: 'Bu Ay Miktar',
      key: 'bu_ay_miktar',
      align: 'right' as const,
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.bu_ay_miktar}
            min={0}
            step={0.001}
            onChange={(v) => handleMiktarChange(index, v as number | null)}
            size="small"
            style={{ width: '100%' }}
            formatter={trNumberFormatter}
            parser={trNumberParser}
          />
        ) : (
          trNumberFormatter(kalem.bu_ay_miktar)
        )
      },
    },
    {
      title: 'Birim Fiyat',
      key: 'birim_fiyat',
      align: 'right' as const,
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.birim_fiyat}
            min={0}
            step={0.01}
            onChange={(v) => handleFiyatChange(index, v as number | null)}
            size="small"
            style={{ width: '100%' }}
            formatter={trMoneyFormatter}
            parser={trNumberParser}
          />
        ) : (
          <MoneyDisplay amount={kalem.birim_fiyat} />
        )
      },
    },
    {
      title: 'Matrah',
      key: 'matrah',
      align: 'right' as const,
      width: 110,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return <MoneyDisplay amount={kalem.bu_ay_miktar * kalem.birim_fiyat} />
      },
    },
    {
      title: 'KDV (%)',
      key: 'kdv_orani',
      align: 'right' as const,
      width: 80,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.kdv_orani}
            min={0}
            max={100}
            onChange={(v) => handleKdvChange(index, v as number | null)}
            size="small"
            style={{ width: '100%' }}
          />
        ) : (
          `%${kalem.kdv_orani}`
        )
      },
    },
    {
      title: 'KDVli Tutar',
      key: 'kdvli_tutar',
      align: 'right' as const,
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        const tutar = kalem.bu_ay_miktar * kalem.birim_fiyat
        return <MoneyDisplay amount={tutar * (1 + kalem.kdv_orani / 100)} />
      },
    },
    {
      title: '',
      key: 'delete',
      width: 40,
      render: (_: any, __: any, index: number) => isTaslak && (
        <Button 
          type="text" 
          danger 
          icon={<DeleteOutlined />} 
          size="small" 
          onClick={() => handleRemoveItem(index)} 
        />
      )
    }
  ]

  return (
    <div>
      <Card loading={isLoading} variant="borderless" style={{ marginBottom: 24 }}>
        {hakedis && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }} size="small">
            <Descriptions.Item label="Firma">{hakedis.sozlesmeler?.firmalar?.unvan}</Descriptions.Item>
            <Descriptions.Item label="Sözleşme">{hakedis.sozlesmeler?.konu}</Descriptions.Item>
            <Descriptions.Item label="Durum">
              <Tag color={durumRenk[hakedis.durum]}>{durumLabel[hakedis.durum]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Dönem">
              {hakedis.donem_baslangic ? dayjs(hakedis.donem_baslangic).format('MM/YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Onay Tarihi">
              {hakedis.onay_tarihi ? dayjs(hakedis.onay_tarihi).format('DD.MM.YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Açıklama" span={2}>
              {hakedis.aciklama || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* Kesinti Özet Kartları */}
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic title="Hakediş Toplam" value={hakedisToplam} formatter={(v) => trMoneyFormatter(v as number)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic
              title={`Teminat (%${teminatOrani})`}
              value={teminatKesintisi}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic
              title={`Stopaj (%${stopajOrani})`}
              value={stopajKesintisi}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic
              title="Diğer Kesintiler"
              value={digerKesintiler}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" size="small" className="shadow-sm" style={{ background: '#f6ffed' }}>
            <Statistic
              title="Net Ödenecek"
              value={netTutar}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontWeight: 'bold' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* İş Kalemleri Tablosu */}
      <Card 
        title="İş Kalemleri" 
        variant="borderless" 
        styles={{ body: { padding: 0 } }}
        className="shadow-sm"
        extra={isTaslak && (
          <Button 
            type="dashed" 
            icon={<PlusOutlined />} 
            onClick={() => setAddModalOpen(true)}
          >
            İş Kalemi Ekle
          </Button>
        )}
      >
        <Table
          columns={columns}
          dataSource={editableKalemler}
          rowKey="is_kalemi_id"
          loading={isLoading}
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7} align="right">
                  <strong>Matrah Toplamı:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7}>
                  <strong><MoneyDisplay amount={araToplam} /></strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong>KDVli Toplam:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9}>
                  <strong><MoneyDisplay amount={hakedisToplam} /></strong>
                </Table.Summary.Cell>
                {isTaslak && <Table.Summary.Cell index={10} />}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {/* Alternatif A: Bağlı İrsaliyeler */}
      <Card
        title={`Bağlı İrsaliyeler (${hakedis?.irsaliyeler?.length || 0})`}
        variant="borderless"
        styles={{ body: { padding: 0 } }}
        className="shadow-sm"
        style={{ marginTop: 24 }}
        extra={isTaslak && (
          <Button
            type="dashed"
            icon={<LinkOutlined />}
            onClick={() => setIrsaliyeModalOpen(true)}
          >
            Açık İrsaliye Ekle
          </Button>
        )}
      >
        {hakedis?.irsaliyeler && hakedis.irsaliyeler.length > 0 ? (
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={hakedis.irsaliyeler}
            columns={[
              { title: 'İrsaliye No', dataIndex: 'irsaliye_no', key: 'no', render: (v: string) => v || '-' },
              {
                title: 'Teslim Tarihi',
                dataIndex: 'teslim_tarihi',
                key: 'tarih',
                render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
                width: 120,
              },
              { title: 'Teslim Alan', dataIndex: 'teslim_alan', key: 'teslim_alan', render: (v: string) => v || '-' },
              {
                title: 'Kalemler',
                key: 'kalemler',
                render: (_: unknown, r: any) => (
                  <Space size="small" wrap>
                    {r.irsaliye_kalemleri?.map((k: any) => (
                      <Tag key={k.id} color="processing">
                        {k.malzeme_adi} — {k.miktar} {k.birim}
                      </Tag>
                    ))}
                  </Space>
                )
              },
              ...(isTaslak ? [{
                title: '',
                key: 'action',
                width: 60,
                render: (_: unknown, r: any) => (
                  <Popconfirm
                    title="Bu irsaliyenin hakedişe bağını kaldırmak istediğinizden emin misiniz?"
                    onConfirm={() => detachIrsaliyeMutation.mutate(r.id)}
                    okText="Evet"
                    cancelText="Hayır"
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DisconnectOutlined />}
                      loading={detachIrsaliyeMutation.isPending}
                    />
                  </Popconfirm>
                )
              }] : []),
            ]}
          />
        ) : (
          <div style={{ padding: 24 }}>
            <Empty description={isTaslak ? "Henüz bağlı irsaliye yok. 'Açık İrsaliye Ekle' butonu ile firmanın boştaki irsaliyelerini bu hakedişe ekleyebilirsiniz." : "Bu hakedişe bağlı irsaliye bulunmuyor."} />
          </div>
        )}
      </Card>

      {/* Açık İrsaliye Seçim Modal */}
      <Modal
        title="Açık İrsaliyeleri Hakedişe Ekle"
        open={irsaliyeModalOpen}
        onCancel={() => { setIrsaliyeModalOpen(false); setSelectedIrsaliyeIds([]) }}
        onOk={() => attachIrsaliyelerMutation.mutate(selectedIrsaliyeIds as string[])}
        okText={`Seçilenleri Ekle (${selectedIrsaliyeIds.length})`}
        okButtonProps={{ disabled: selectedIrsaliyeIds.length === 0, loading: attachIrsaliyelerMutation.isPending }}
        cancelText="Vazgeç"
        destroyOnHidden
        width="min(900px, 95vw)"
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Aşağıda <strong>{hakedis?.sozlesmeler?.firmalar?.unvan}</strong> firmasının henüz herhangi bir hakedişe bağlanmamış irsaliyeleri listeleniyor.
        </Text>
        <Table
          size="small"
          loading={irsaliyelerLoading}
          dataSource={acikIrsaliyeler}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          rowSelection={{
            selectedRowKeys: selectedIrsaliyeIds,
            onChange: setSelectedIrsaliyeIds,
          }}
          locale={{ emptyText: <Empty description="Bu firmanın açık irsaliyesi bulunmuyor" /> }}
          columns={[
            { title: 'İrsaliye No', dataIndex: 'irsaliye_no', key: 'no', render: (v: string) => v || '-', width: 130 },
            {
              title: 'Teslim Tarihi',
              dataIndex: 'teslim_tarihi',
              key: 'tarih',
              render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
              width: 120,
            },
            { title: 'Teslim Alan', dataIndex: 'teslim_alan', key: 'teslim_alan', render: (v: string) => v || '-' },
            {
              title: 'Kalemler',
              key: 'kalemler',
              render: (_: unknown, r: any) => (
                <Space size="small" wrap>
                  {r.irsaliye_kalemleri?.map((k: any) => (
                    <Tag key={k.id}>
                      {k.malzeme_adi} — {k.miktar} {k.birim}
                    </Tag>
                  ))}
                </Space>
              )
            },
          ]}
        />
      </Modal>

      <Modal
        title="Sözleşmeden İş Kalemi Ekle"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={handleAddItem}
        okText="Ekle"
        cancelText="İptal"
        destroyOnHidden
        width="min(520px, 95vw)"
      >
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Sözleşmede tanımlı olan iş kalemlerinden birini seçin:
          </Text>
          <Select
            style={{ width: '100%' }}
            placeholder="İş kalemi seçin"
            value={selectedKalemId}
            onChange={setSelectedKalemId}
            showSearch
            optionFilterProp="children"
          >
            {sozlesmeIsKalemleri?.filter(k => !editableKalemler.some(ek => ek.is_kalemi_id === k.id)).map(k => (
              <Select.Option key={k.id} value={k.id}>
                {k.poz_no ? `[${k.poz_no}] ` : ''}{k.tanim}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  )
}
