import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, InputNumber, Button, Space, Card, Typography, Empty, Row, Col, Statistic, Popconfirm, Modal, Select, App, Tabs, Grid } from 'antd'
import { SaveOutlined, PlusOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { usePageSettings } from '../../contexts/LayoutContext'
import dayjs from 'dayjs'

const { Text } = Typography

export const YillikPlanPage: React.FC = () => {
  const { id: projeId, yil } = useParams<{ id: string, yil: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  const [editingValues, setEditingValues] = useState<Record<string, number>>({})
  const [editingAdet, setEditingAdet] = useState<Record<string, number | null>>({})
  const [editingFiyat, setEditingFiyat] = useState<Record<string, number | null>>({})
  const [addRowModalOpen, setAddRowModalOpen] = useState(false)
  const [selectedKalemId, setSelectedKalemId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tutar' | 'adet'>('tutar')

  const { data: plan, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['proje-plan', projeId, yil],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/projeler/${projeId}/yillik-plan/${yil}`)
        return data.data
      } catch (err: any) {
        // Backend 404 → plan yok (hata değil)
        if (err?.status === 404 || err?.response?.status === 404) return null
        throw err
      }
    }
  })

  // Proje bilgilerini getir
  const { data: project } = useQuery({
    queryKey: ['proje', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}`)
      return data.data
    },
    enabled: !!projeId
  })

  // Yıl seçenekleri (Proje başlangıç ve bitiş tarihlerine göre)
  const yearOptions = useMemo(() => {
    const currentYear = dayjs().year()
    let startYear = currentYear - 1
    let endYear = currentYear + 1

    if (project?.baslangic_tarihi) {
      startYear = dayjs(project.baslangic_tarihi).year()
    }
    if (project?.bitis_tarihi) {
      endYear = dayjs(project.bitis_tarihi).year()
    } else if (project?.baslangic_tarihi) {
      // Bitiş yoksa başlangıçtan itibaren 5 yıl göster
      endYear = startYear + 5
    }

    // Başlangıç bitişten büyükse (hatalı veri) düzelt
    if (startYear > endYear) endYear = startYear

    const years = []
    for (let i = startYear; i <= endYear; i++) {
      years.push({ label: `${i} Yılı`, value: String(i) })
    }
    return years
  }, [project])

  const handleYearChange = (newYear: string) => {
    navigate(`/projeler/${projeId}/yillik-plan/${newYear}`)
  }

  const createPlanMutation = useMutation({
    mutationFn: async (targetYil?: number) => {
      const { data } = await api.post(`/projeler/${projeId}/yillik-plan`, { yil: targetYil })
      return data
    },
    onSuccess: (data) => {
      const msg = data.message || 'Yıllık plan(lar) oluşturuldu'
      messageApi.success(msg)
      // Tüm proje planlarını geçersiz kıl
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const updateKalemMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string, values: any }) => {
      return await api.put(`/projeler/yillik-plan-kalemleri/${id}`, values)
    },
    onSuccess: () => {
      messageApi.success('Plan güncellendi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setEditingValues({})
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const deleteRowMutation = useMutation({
    mutationFn: async (isKalemiId: string) => {
      return await api.delete(`/projeler/yillik-plan-kalemleri/${plan.id}/${isKalemiId}`)
    },
    onSuccess: () => {
      messageApi.success('İş kalemi bu plandan kaldırıldı')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const { data: projeIsKalemleri } = useQuery({
    queryKey: ['proje-is-kalemleri', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}`)
      return (data.data.proje_is_kalemleri || []).filter((k: any) => !k.ust_kalem_id)
    },
    enabled: !!projeId
  })

  const addKalemMutation = useMutation({
    mutationFn: async (isKalemiId: string) => {
      const planId = plan.id
      const planKalemleri = []
      for (let ay = 1; ay <= 12; ay++) {
        planKalemleri.push({
          plan_id: planId,
          proje_is_kalemi_id: isKalemiId,
          ay,
          planlanan_tutar: 0,
          gerceklesen_tutar: 0
        })
      }
      return await api.post(`/projeler/yillik-plan-kalemleri/bulk`, { kalemler: planKalemleri })
    },
    onSuccess: () => {
      messageApi.success('İş kalemi plana eklendi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setAddRowModalOpen(false)
      setSelectedKalemId(null)
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const pivotedData: Record<string, any> = useMemo(() => {
    if (!plan?.yillik_plan_kalemleri) return {}
    const data: Record<string, any> = {}
    plan.yillik_plan_kalemleri.forEach((pk: any) => {
      if (!data[pk.proje_is_kalemi_id]) {
        data[pk.proje_is_kalemi_id] = {
          kalem_id: pk.proje_is_kalemi_id,
          kalem_kodu: pk.proje_is_kalemleri.kalem_kodu,
          tanim: pk.proje_is_kalemleri.tanim,
          // REV-PLAN-02: Adet sekmesi birim fiyat input'u, kayıtlı değer yoksa
          // harcama kaleminin master birim_fiyat değerini default olarak gösterir.
          varsayilan_birim_fiyat: pk.proje_is_kalemleri.birim_fiyat ?? null,
          aylar: {}
        }
      }
      data[pk.proje_is_kalemi_id].aylar[pk.ay] = pk
    })
    return data
  }, [plan])

  const dataSource = useMemo(() => Object.values(pivotedData), [pivotedData])

  const headerActions = useMemo(() => (
    <Space orientation="horizontal" size="small">
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(`/projeler/${projeId}`)}
        size="small"
      >
        Geri
      </Button>
      <Select
        value={yil}
        onChange={handleYearChange}
        options={yearOptions}
        style={{ width: 120 }}
        size="small"
      />
      {plan && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddRowModalOpen(true)}
          size="small"
        >
          Satır Ekle
        </Button>
      )}
    </Space>
  ), [yil, yearOptions, plan, projeId, navigate])

  // Mobil görünümde header title'ı gizle (kullanıcı isteği 2026-05-24):
  // başlık yıl seçici + butonlarla zaten redundant — dar ekranda yer tutmasın.
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  usePageSettings(isMobile ? '' : `${yil} Yılı Yıllık Planı`, headerActions)

  const handleInputChange = (pkId: string, value: number | null) => {
    setEditingValues(prev => ({ ...prev, [pkId]: value || 0 }))
  }

  const handleAdetChange = (pkId: string, value: number | null) => {
    setEditingAdet(prev => ({ ...prev, [pkId]: value }))
  }

  const handleFiyatChange = (pkId: string, value: number | null) => {
    setEditingFiyat(prev => ({ ...prev, [pkId]: value }))
  }

  const handleSave = async (kalemGroup: any) => {
    const ids = (Object.values(kalemGroup.aylar) as any[]).map((pk: any) => pk.id as string)

    type Patch = { planlanan_tutar?: number; planlanan_adet?: number | null; planlanan_birim_fiyat?: number | null }
    const payloads: Array<{ id: string; values: Patch }> = []

    for (const id of ids) {
      const patch: Patch = {}
      if (Object.prototype.hasOwnProperty.call(editingValues, id)) {
        patch.planlanan_tutar = editingValues[id] || 0
      }
      if (Object.prototype.hasOwnProperty.call(editingAdet, id)) {
        patch.planlanan_adet = editingAdet[id]
      }
      if (Object.prototype.hasOwnProperty.call(editingFiyat, id)) {
        patch.planlanan_birim_fiyat = editingFiyat[id]
      }
      if (Object.keys(patch).length > 0) {
        payloads.push({ id, values: patch })
      }
    }

    if (payloads.length === 0) return

    try {
      await Promise.all(payloads.map(p =>
        api.put(`/projeler/yillik-plan-kalemleri/${p.id}`, p.values)
      ))
      messageApi.success('Değişiklikler kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      // Kaydedilen kalemlerin geçici state'ini temizle
      setEditingValues(prev => {
        const next = { ...prev }
        ids.forEach(id => delete next[id])
        return next
      })
      setEditingAdet(prev => {
        const next = { ...prev }
        ids.forEach(id => delete next[id])
        return next
      })
      setEditingFiyat(prev => {
        const next = { ...prev }
        ids.forEach(id => delete next[id])
        return next
      })
    } catch {
      messageApi.error('Bazı kalemler kaydedilemedi')
    }
  }

  // İş Kalemi sütunu — kullanıcı isteği (2026-05-24):
  //   sabit (sticky) konumlandırma kaldırıldı + genişlik %20 daraltıldı (200 → 160).
  //   Hem "Bütçe Girişi" hem "Adet × Birim Fiyat" sekmelerinde aynı kolon kullanılıyor.
  const kalemColumn = {
    title: 'İş Kalemi',
    dataIndex: 'tanim',
    key: 'tanim',
    width: 160,
    render: (text: string, record: any) => (
      <div>
        <Typography.Text strong>{record.kalem_kodu}</Typography.Text>
        <br />
        <Typography.Text style={{ fontSize: '12px' }}>{text}</Typography.Text>
      </div>
    ),
  }

  const isRecordDirty = (record: any) => {
    const ids = (Object.values(record.aylar) as any[]).map((pk: any) => pk.id as string)
    return (
      ids.some((id) => Object.prototype.hasOwnProperty.call(editingValues, id)) ||
      ids.some((id) => Object.prototype.hasOwnProperty.call(editingAdet, id)) ||
      ids.some((id) => Object.prototype.hasOwnProperty.call(editingFiyat, id))
    )
  }

  // İşlem sütunu — kullanıcı isteği (2026-05-24): sticky/fixed kaldırıldı,
  // tablo yatay kaydırılırken son sütun da akar.
  const actionColumn = {
    title: 'İşlem',
    key: 'action',
    width: 100,
    render: (_: any, record: any) => (
      <Space orientation="horizontal">
        <Button
          type="primary"
          size="small"
          icon={<SaveOutlined />}
          onClick={() => handleSave(record)}
          disabled={!isRecordDirty(record)}
        />
        <Popconfirm
          title="İş kalemini sil"
          description="Bu iş kalemini ve plana ait tüm satırları silmek istediğinize emin misiniz?"
          onConfirm={() => deleteRowMutation.mutate(record.kalem_id)}
          okText="Evet"
          cancelText="Hayır"
        >
          <Button size="small" danger icon={<DeleteOutlined />} loading={deleteRowMutation.isPending} />
        </Popconfirm>
      </Space>
    ),
  }

  const tutarColumns = [
    kalemColumn,
    ...Array.from({ length: 12 }, (_, i) => i + 1).map(ay => ({
      title: `${ay}. Ay`,
      key: `ay_${ay}`,
      width: 120,
      render: (_: any, record: any) => {
        const pk = record.aylar[ay]
        if (!pk) return '-'
        return (
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            value={editingValues[pk.id] !== undefined ? editingValues[pk.id] : pk.planlanan_tutar}
            onChange={(val) => handleInputChange(pk.id, val as number | null)}
            formatter={trMoneyFormatter}
            parser={trNumberParser}
            decimalSeparator=","
          />
        )
      },
    })),
    actionColumn,
  ]

  const adetColumns = [
    kalemColumn,
    ...Array.from({ length: 12 }, (_, i) => i + 1).map(ay => ({
      title: `${ay}. Ay`,
      key: `ay_${ay}`,
      width: 150,
      render: (_: any, record: any) => {
        const pk = record.aylar[ay]
        if (!pk) return '-'

        const adet =
          editingAdet[pk.id] !== undefined ? editingAdet[pk.id] : (pk.planlanan_adet ?? null)
        // REV-PLAN-02: kullanıcının kayıtlı değeri yoksa harcama kaleminin master birim
        // fiyatını default olarak göster. Kullanıcı kaydederse planlanan_birim_fiyat DB'ye yazılır.
        const fiyat =
          editingFiyat[pk.id] !== undefined
            ? editingFiyat[pk.id]
            : (pk.planlanan_birim_fiyat ?? record.varsayilan_birim_fiyat ?? null)
        const hesaplanan =
          adet != null && fiyat != null ? Math.round(Number(adet) * Number(fiyat) * 100) / 100 : null

        return (
          <Space orientation="vertical" size={2} style={{ width: '100%' }}>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={0}
              placeholder="Adet"
              value={adet ?? undefined}
              onChange={(val) => handleAdetChange(pk.id, val as number | null)}
              formatter={trNumberFormatter}
              parser={trNumberParser}
              decimalSeparator=","
              onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
            />
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={0}
              placeholder="Birim Fiyat"
              value={fiyat ?? undefined}
              onChange={(val) => handleFiyatChange(pk.id, val as number | null)}
              formatter={trMoneyFormatter}
              parser={trNumberParser}
              decimalSeparator=","
              onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {hesaplanan != null ? `= ₺${trMoneyFormatter(hesaplanan)}` : `₺${trMoneyFormatter(pk.planlanan_tutar || 0)}`}
            </Text>
          </Space>
        )
      },
    })),
    actionColumn,
  ]

  const toplamPlanlanan = useMemo(() => 
    plan?.yillik_plan_kalemleri?.reduce((sum: number, pk: any) => sum + (parseFloat(pk.planlanan_tutar) || 0), 0) || 0
  , [plan])

  const toplamGerceklesen = useMemo(() => 
    plan?.yillik_plan_kalemleri?.reduce((sum: number, pk: any) => sum + (parseFloat(pk.gerceklesen_tutar) || 0), 0) || 0
  , [plan])

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  if (!plan) {
    const hasKalemler = projeIsKalemleri && projeIsKalemleri.length > 0
    return (
      <div className="animate-in fade-in duration-500">
        <Card variant="borderless" className="shadow-sm" style={{ textAlign: 'center', padding: '50px' }}>
          <Empty 
            description={
              <span>
                {yil} yılı için henüz bir yıllık plan oluşturulmamış.
                {!hasKalemler && (
                  <div style={{ color: '#ff4d4f', marginTop: 10 }}>
                    <Text type="danger">Hata: Bu proje için henüz İş Kalemi tanımlanmamış. Plan oluşturabilmek için önce İş Kalemi eklemelisiniz.</Text>
                  </div>
                )}
              </span>
            }
          >
            <Space orientation="vertical">
              <Button 
                type="primary" 
                onClick={() => createPlanMutation.mutate(parseInt(yil!))} 
                loading={createPlanMutation.isPending}
                disabled={!hasKalemler}
              >
                Sadece {yil} Yılı İçin Oluştur
              </Button>
              <Button 
                onClick={() => createPlanMutation.mutate(undefined)} 
                loading={createPlanMutation.isPending}
                disabled={!hasKalemler}
              >
                Projenin Tüm Yılları İçin Planları Oluştur
              </Button>
            </Space>
          </Empty>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-500">
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="shadow-sm" size="small">
            <Statistic 
              title="Toplam Proje Bütçesi" 
              value={plan.toplam_butce || 0} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { fontWeight: 700 } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="shadow-sm" size="small">
            <Statistic 
              title="Planda Toplam" 
              value={toplamPlanlanan} 
              prefix="₺" 
              styles={{ content: { color: '#1890ff', fontWeight: 700 } }} 
              formatter={(v) => trMoneyFormatter(v as number)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="shadow-sm" size="small">
            <Statistic 
              title="Gerçekleşen Toplam" 
              value={toplamGerceklesen} 
              prefix="₺" 
              styles={{ content: { color: '#52c41a', fontWeight: 700 } }} 
              formatter={(v) => trMoneyFormatter(v as number)}
            />
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" styles={{ body: { padding: 0 } }} className="shadow-sm overflow-hidden">
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'tutar' | 'adet')}
          tabBarStyle={{ paddingLeft: 12, paddingRight: 12, marginBottom: 0 }}
          items={[
            {
              key: 'tutar',
              label: 'Bütçe Girişi (₺)',
              children: (
                <Table
                  dataSource={dataSource}
                  columns={tutarColumns}
                  rowKey="kalem_id"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  size="small"
                />
              ),
            },
            {
              key: 'adet',
              label: 'Adet × Birim Fiyat',
              children: (
                <Table
                  dataSource={dataSource}
                  columns={adetColumns}
                  rowKey="kalem_id"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  size="small"
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Plana Yeni İş Kalemi Ekle"
        open={addRowModalOpen}
        onCancel={() => {
          setAddRowModalOpen(false)
          setSelectedKalemId(null)
        }}
        onOk={() => selectedKalemId && addKalemMutation.mutate(selectedKalemId)}
        confirmLoading={addKalemMutation.isPending}
        okText="Ekle"
        cancelText="İptal"
        width="min(520px, 95vw)"
        destroyOnHidden
      >
        <div style={{ marginBottom: 16, marginTop: 16 }}>
          <Typography.Text type="secondary">Mevcut iş kalemleri içinden seçim yapın:</Typography.Text>
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder="İş kalemi seçin"
          value={selectedKalemId}
          onChange={setSelectedKalemId}
          showSearch
          optionFilterProp="children"
        >
          {projeIsKalemleri?.filter((k: any) => !dataSource.some(d => d.kalem_id === k.id)).map((k: any) => (
            <Select.Option key={k.id} value={k.id}>
              {k.kalem_kodu ? `[${k.kalem_kodu}] ` : ''}{k.tanim}
            </Select.Option>
          ))}
        </Select>
        {projeIsKalemleri?.filter((k: any) => !dataSource.some(d => d.kalem_id === k.id)).length === 0 && (
          <div style={{ marginTop: 8, color: '#ff4d4f' }}>
            Eklenebilecek yeni bir iş kalemi bulunamadı. Önce proje detay sayfasından yeni bir iş kalemi oluşturmalısınız.
          </div>
        )}
      </Modal>
    </div>
  )
}
