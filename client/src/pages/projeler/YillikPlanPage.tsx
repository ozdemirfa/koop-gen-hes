import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, InputNumber, Button, Space, Card, Typography, Empty, Row, Col, Statistic, Popconfirm, Modal, Select, App } from 'antd'
import { SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'
import { PageHeader } from '../../components/common/PageHeader'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import dayjs from 'dayjs'

const { Text } = Typography

export const YillikPlanPage: React.FC = () => {
  const { id: projeId, yil } = useParams<{ id: string, yil: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  const [editingValues, setEditingValues] = useState<Record<string, number>>({})
  const [addRowModalOpen, setAddRowModalOpen] = useState(false)
  const [selectedKalemId, setSelectedKalemId] = useState<string | null>(null)

  const { data: plan, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['proje-plan', projeId, yil],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/projeler/${projeId}/yillik-plan/${yil}`)
        return data.data
      } catch (err: any) {
        // Eğer backend 404 dönerse bunu hata değil, plan yok olarak kabul et
        if (err.status === 404 || err.response?.status === 404) return null
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
      console.log(`[DEBUG] createPlanMutation called for project: ${projeId}, targetYear: ${targetYil}`)
      const { data } = await api.post(`/projeler/${projeId}/yillik-plan`, { yil: targetYil })
      return data
    },
    onSuccess: (data) => {
      console.log('[DEBUG] createPlanMutation success:', data)
      const msg = data.message || 'Yıllık plan(lar) oluşturuldu'
      messageApi.success(msg)
      // Tüm proje planlarını geçersiz kıl
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId] })
    },
    onError: (err: any) => {
      console.error('[DEBUG] createPlanMutation error:', err)
      messageApi.error(err.message || 'Hata oluştu')
    }
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
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const deleteRowMutation = useMutation({
    mutationFn: async (isKalemiId: string) => {
      return await api.delete(`/projeler/yillik-plan-kalemleri/${plan.id}/${isKalemiId}`)
    },
    onSuccess: () => {
      messageApi.success('Harcama kalemi bu plandan kaldırıldı')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
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
      messageApi.success('Harcama kalemi plana eklendi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setAddRowModalOpen(false)
      setSelectedKalemId(null)
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
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
          aylar: {}
        }
      }
      data[pk.proje_is_kalemi_id].aylar[pk.ay] = pk
    })
    return data
  }, [plan])

  const dataSource = useMemo(() => Object.values(pivotedData), [pivotedData])

  const handleInputChange = (pkId: string, value: number | null) => {
    setEditingValues(prev => ({ ...prev, [pkId]: value || 0 }))
  }

  const handleSave = async (kalemGroup: any) => {
    const updates = Object.entries(editingValues)
      .filter(([id]) => Object.values(kalemGroup.aylar).some((pk: any) => pk.id === id))
    
    if (updates.length === 0) return

    try {
      await Promise.all(updates.map(([id, val]) => 
        api.put(`/projeler/yillik-plan-kalemleri/${id}`, { planlanan_tutar: val })
      ))
      messageApi.success('Değişiklikler kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setEditingValues({})
    } catch (err: any) {
      messageApi.error('Bazı kalemler kaydedilemedi')
    }
  }

  const columns = [
    {
      title: 'İş Kalemi',
      dataIndex: 'tanim',
      key: 'tanim',
      fixed: 'left' as const,
      width: 200,
      render: (text: string, record: any) => (
        <div>
          <Typography.Text strong>{record.kalem_kodu}</Typography.Text>
          <br />
          <Typography.Text style={{ fontSize: '12px' }}>{text}</Typography.Text>
        </div>
      )
    },
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
      }
    })),
    {
      title: 'İşlem',
      key: 'action',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: any) => (
        <Space orientation="horizontal">
          <Button 
            type="primary" 
            size="small" 
            icon={<SaveOutlined />} 
            onClick={() => handleSave(record)}
            disabled={!Object.keys(editingValues).some(id => Object.values(record.aylar).some((pk: any) => pk.id === id))}
          />
          <Popconfirm
            title="Harcama kalemini sil"
            description="Bu harcama kalemini ve plana ait tüm satırları silmek istediğinize emin misiniz?"
            onConfirm={() => deleteRowMutation.mutate(record.kalem_id)}
            okText="Evet"
            cancelText="Hayır"
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deleteRowMutation.isPending} />
          </Popconfirm>
        </Space>
      )
    }
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
        <PageHeader 
          title={`${yil} Yılı Harcama Planı`} 
          onBack={() => navigate(`/projeler/${projeId}`)}
          extra={
            <Select 
              value={yil} 
              onChange={handleYearChange} 
              options={yearOptions} 
              style={{ width: 120 }}
            />
          }
        />
        <Card variant="borderless" className="shadow-sm" style={{ textAlign: 'center', padding: '50px' }}>
          <Empty 
            description={
              <span>
                {yil} yılı için henüz bir harcama planı oluşturulmamış.
                {!hasKalemler && (
                  <div style={{ color: '#ff4d4f', marginTop: 10 }}>
                    <Text type="danger">Hata: Bu proje için henüz Harcama Kalemi tanımlanmamış. Plan oluşturabilmek için önce Harcama Kalemi eklemelisiniz.</Text>
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
      <PageHeader 
        title={`${yil} Yılı Harcama Planı`} 
        onBack={() => navigate(`/projeler/${projeId}`)}
        extra={
          <Space orientation="horizontal">
            <Select 
              value={yil} 
              onChange={handleYearChange} 
              options={yearOptions} 
              style={{ width: 120 }}
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => setAddRowModalOpen(true)}
            >
              Satır Ekle
            </Button>
          </Space>
        }
      />

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
        <Table
          dataSource={dataSource}
          columns={columns}
          rowKey="kalem_id"
          pagination={false}
          scroll={{ x: 1600 }}
          size="small"
        />
      </Card>

      <Modal
        title="Plana Yeni Harcama Kalemi Ekle"
        open={addRowModalOpen}
        onCancel={() => {
          setAddRowModalOpen(false)
          setSelectedKalemId(null)
        }}
        onOk={() => selectedKalemId && addKalemMutation.mutate(selectedKalemId)}
        confirmLoading={addKalemMutation.isPending}
        okText="Ekle"
        cancelText="İptal"
        destroyOnHidden
      >
        <div style={{ marginBottom: 16, marginTop: 16 }}>
          <Typography.Text type="secondary">Mevcut harcama kalemleri içinden seçim yapın:</Typography.Text>
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder="Harcama kalemi seçin"
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
            Eklenebilecek yeni bir harcama kalemi bulunamadı. Önce proje detay sayfasından yeni bir harcama kalemi oluşturmalısınız.
          </div>
        )}
      </Modal>
    </div>
  )
}
