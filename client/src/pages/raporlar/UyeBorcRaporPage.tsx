import React, { useMemo } from 'react'
import { Card, Table, Button, Space, Typography, Statistic, Row, Col } from 'antd'
import { FilePdfOutlined, UserOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

import { trMoneyFormatter } from '../../lib/format'

const { Text } = Typography

export const UyeBorcRaporPage: React.FC = () => {
  const navigate = useNavigate()
  const activeProjectId = localStorage.getItem('activeProjectId')

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['uye-borc-listesi', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data } = await api.get('/raporlar/uye-borc-listesi', {
        params: { proje_id: activeProjectId }
      })
      return data.data
    },
    enabled: !!activeProjectId
  })

  const actions = useMemo(() => (
    <Button 
      size="small"
      icon={<FilePdfOutlined />} 
      onClick={() => {
        window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/raporlar/uye-borc-listesi/pdf?proje_id=${activeProjectId}`, '_blank');
      }}
      disabled={!activeProjectId}
    >
      PDF İndir
    </Button>
  ), [activeProjectId])

  usePageSettings('Üye Borç Listesi', actions)

  const columns = [
    // ... rest of columns
  ]

  if (!activeProjectId) {
    return (
      <Card>
        <Typography.Text type="secondary">Lütfen rapor görüntülemek için bir proje seçin.</Typography.Text>
      </Card>
    )
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const genelToplamBorc = list?.reduce((s: number, r: any) => s + r.toplam_borc, 0) || 0

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <Statistic 
              title="Borçlu Üye Sayısı" 
              value={list?.length || 0} 
              prefix={<TeamOutlined />}
              styles={{ content: { fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <Statistic 
              title="Genel Toplam Borç" 
              value={genelToplamBorc} 
              prefix={<DollarOutlined />} 
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { color: '#cf1322', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Table
          dataSource={list || []}
          columns={columns}
          rowKey="uye_no"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  )
}
