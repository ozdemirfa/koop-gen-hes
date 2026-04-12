import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, InputNumber, Button, Space, message, Card, Typography, Empty, Row, Col, Statistic } from 'antd'
import { SaveOutlined, ArrowLeftOutlined, CalendarOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

const { Text } = Typography

export const YillikPlanPage: React.FC = () => {
  const { id: projeId, yil } = useParams<{ id: string, yil: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingValues, setEditingValues] = useState<Record<string, number>>({})

  const { data: plan, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['proje-plan', projeId, yil],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/projeler/${projeId}/yillik-plan/${yil}`)
        return data.data
      } catch (err: any) {
        if (err.status === 404) return null
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
            onChange={(val) => handleInputChange(pk.id, val)}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          />
        )
      }
    })),
    {
      title: 'İşlem',
      key: 'action',
      fixed: 'right' as const,
      width: 80,
      render: (_: any, record: any) => (
        <Button 
          type="primary" 
          size="small" 
          icon={<SaveOutlined />} 
          onClick={() => handleSave(record)}
          disabled={!Object.keys(editingValues).some(id => Object.values(record.aylar).some((pk: any) => pk.id === id))}
        />
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
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Toplam Bütçe" value={plan.toplam_butce} prefix="₺" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Planlanan Toplam" value={toplamPlanlanan} prefix="₺" valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Gerçekleşen Toplam" value={toplamGerceklesen} prefix="₺" valueStyle={{ color: '#52c41a' }} />
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
    </div>
  )
}
