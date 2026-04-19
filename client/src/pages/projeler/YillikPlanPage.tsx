import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, InputNumber, Button, Space, message, Card, Typography, Empty, Row, Col, Statistic, Popconfirm, Modal, Select } from 'antd'
import { SaveOutlined, ArrowLeftOutlined, CalendarOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { trNumberFormatter, trNumberParser } from '../../lib/format'
import { PageHeader } from '../../components/common/PageHeader'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

const { Text } = Typography

export const YillikPlanPage: React.FC = () => {
  const { id: projeId, yil } = useParams<{ id: string, yil: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
        if (err.status === 404 || err.error === 'Yıllık plan bulunamadı') return null
        throw err
      }
    }
  })

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/projeler/${projeId}/yillik-plan`, { yil: parseInt(yil!) })
    },
    onSuccess: () => {
      message.success('Yıllık plan oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const updateKalemMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string, values: any }) => {
      return await api.put(`/projeler/yillik-plan-kalemleri/${id}`, values)
    },
    onSuccess: () => {
      message.success('Plan güncellendi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setEditingValues({})
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const deleteRowMutation = useMutation({
    mutationFn: async (isKalemiId: string) => {
      return await api.delete(`/projeler/is-kalemleri/${isKalemiId}`)
    },
    onSuccess: () => {
      message.success('Satır (Harcama Kalemi) silindi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      queryClient.invalidateQueries({ queryKey: ['proje', projeId] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
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
      message.success('Harcama kalemi plana eklendi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setAddRowModalOpen(false)
      setSelectedKalemId(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  if (!plan) {
    return (
      <div>
        <PageHeader title={`${yil} Yılı Harcama Planı`} onBack={() => navigate(`/projeler/${projeId}`)} />
        <Card style={{ textAlign: 'center', padding: '50px' }}>
          <Empty description={`${yil} yılı için henüz bir harcama planı oluşturulmamış.`}>
            <Button type="primary" onClick={() => createPlanMutation.mutate()} loading={createPlanMutation.isPending}>
              Şimdi Oluştur
            </Button>
          </Empty>
        </Card>
      </div>
    )
  }

  // Veriyi pivot et: proje_is_kalemi_id -> { ay: plan_kalemi }
  const pivotedData: Record<string, any> = {}
  plan.yillik_plan_kalemleri.forEach((pk: any) => {
    if (!pivotedData[pk.proje_is_kalemi_id]) {
      pivotedData[pk.proje_is_kalemi_id] = {
        kalem_id: pk.proje_is_kalemi_id,
        kalem_kodu: pk.proje_is_kalemleri.kalem_kodu,
        tanim: pk.proje_is_kalemleri.tanim,
        aylar: {}
      }
    }
    pivotedData[pk.proje_is_kalemi_id].aylar[pk.ay] = pk
  })

  const dataSource = Object.values(pivotedData)

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
      message.success('Değişiklikler kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['proje-plan', projeId, yil] })
      setEditingValues({})
    } catch (err: any) {
      message.error('Bazı kalemler kaydedilemedi')
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
          <Text strong>{record.kalem_kodu}</Text>
          <br />
          <Text style={{ fontSize: '12px' }}>{text}</Text>
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
            formatter={trNumberFormatter}
            parser={trNumberParser}
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
        <Space>
          <Button 
            type="primary" 
            size="small" 
            icon={<SaveOutlined />} 
            onClick={() => handleSave(record)}
            disabled={!Object.keys(editingValues).some(id => Object.values(record.aylar).some((pk: any) => pk.id === id))}
          />
          <Popconfirm
            title="Bu harcama kalemini ve plan satırını silmek istediğinize emin misiniz?"
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

  const toplamPlanlanan = plan.yillik_plan_kalemleri.reduce((sum: number, pk: any) => sum + (parseFloat(pk.planlanan_tutar) || 0), 0)
  const toplamGerceklesen = plan.yillik_plan_kalemleri.reduce((sum: number, pk: any) => sum + (parseFloat(pk.gerceklesen_tutar) || 0), 0)

  return (
    <div>
      <PageHeader 
        title={`${yil} Yılı Harcama Planı`} 
        onBack={() => navigate(`/projeler/${projeId}`)}
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => setAddRowModalOpen(true)}
          >
            Satır Ekle
          </Button>
        }
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Toplam Bütçe" 
              value={plan.toplam_butce} 
              prefix="₺" 
              formatter={(v) => trNumberFormatter(v as number)}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Planlanan Toplam" 
              value={toplamPlanlanan} 
              prefix="₺" 
              styles={{ content: { color: '#1890ff' } }} 
              formatter={(v) => trNumberFormatter(v as number)}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Gerçekleşen Toplam" 
              value={toplamGerceklesen} 
              prefix="₺" 
              styles={{ content: { color: '#52c41a' } }} 
              formatter={(v) => trNumberFormatter(v as number)}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table
          dataSource={dataSource}
          columns={columns}
          rowKey="kalem_id"
          pagination={false}
          scroll={{ x: 1500 }}
          bordered
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
      >
        <div style={{ marginBottom: 16, marginTop: 16 }}>
          <Text type="secondary">Mevcut harcama kalemleri içinden seçim yapın:</Text>
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
