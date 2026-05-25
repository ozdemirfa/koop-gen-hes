import React, { useMemo } from 'react'
import { Card, Table, Typography, Statistic, Row, Col, Tag, Button, Space } from 'antd'
import { DataTable } from '../../components/common/DataTable'
import { EmptyState } from '../../components/common/EmptyState'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  FileSearchOutlined,
  DownloadOutlined,
  TeamOutlined,
  ShopOutlined
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { trNumberFormatter, trMoneyFormatter } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'
import dayjs from 'dayjs'

const { Text } = Typography

interface MizanData {
  id: string
  cari_adi: string
  cari_turu: 'uye' | 'firma'
  toplam_borc: number
  toplam_alacak: number
  bakiye: number
}

export const MizanPage: React.FC = () => {
  const { activeProject } = useProject()

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rapor-mizan', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const response = await api.get('/raporlar/mizan', {
        params: { proje_id: activeProject.id }
      })
      return response.data.data as MizanData[]
    },
    enabled: !!activeProject?.id
  })

  const handleCsvDownload = () => {
    if (!list || list.length === 0) return
    downloadCsv(`genel-mizan-${dayjs().format('YYYYMMDD')}`, [
      {
        title: `Genel Mizan — ${dayjs().format('DD.MM.YYYY')}`,
        headers: ['Cari Adı', 'Tür', 'Toplam Borç', 'Toplam Alacak', 'Bakiye', 'Bakiye Yönü'],
        rows: list.map((r) => [
          r.cari_adi,
          r.cari_turu === 'uye' ? 'ÜYE' : 'FİRMA',
          r.toplam_borc,
          r.toplam_alacak,
          r.bakiye,
          r.bakiye > 0 ? 'ALACAK BAKİYESİ (A)' : (r.bakiye < 0 ? 'BORÇ BAKİYESİ (B)' : 'DENK'),
        ]),
      },
    ], { projectName: activeProject?.proje_adi })
  }

  const actions = useMemo(() => {
    // LayoutContext fingerprint key (PR #16/19/30/35 pattern) — list undefined→array
    // geçişinde Button'un disabled prop'u stale kalmasın.
    const hasData = !!list && list.length > 0
    return (
      <Space key={`mizan-${hasData ? `n${list?.length}` : 'empty'}`}>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={handleCsvDownload}
          disabled={!hasData}
        >
          CSV İndir
        </Button>
      </Space>
    )
  }, [list])

  usePageSettings('Genel Mizan', actions)

  const stats = useMemo(() => {
    if (!list) return { totalWeAreOwed: 0, totalWeOwe: 0 }
    
    // User Tanımı: 
    // Pozitif Bakiye (Alacak Bakiyesi) -> Projenin Alacağı (Üye/Firma bize borçlu)
    // Negatif Bakiye (Borç Bakiyesi) -> Projenin Borcu (Bizim firmaya/üyeye borcumuz)
    
    let totalWeAreOwed = 0; // Toplam Alacağımız (Alacak Bakiyesi verenler > 0)
    let totalWeOwe = 0; // Toplam Borçlu Olduğumuz (Borç Bakiyesi verenler < 0)

    list.forEach(item => {
      if (item.bakiye > 0) {
        totalWeAreOwed += item.bakiye
      } else if (item.bakiye < 0) {
        totalWeOwe += Math.abs(item.bakiye)
      }
    })

    return { totalWeAreOwed, totalWeOwe }
  }, [list])

  // Sütun aralıkları sıkıştırıldı (kullanıcı isteği 2026-05-24): Tür 120→80,
  // tutar sütunlarına da width eklendi ki cari adı esnek kalsın ve diğerleri
  // gereksiz yer kaplamasın.
  const columns = [
    {
      title: 'Cari Adı',
      dataIndex: 'cari_adi',
      key: 'cari_adi',
      ellipsis: true,
      sorter: (a: MizanData, b: MizanData) => a.cari_adi.localeCompare(b.cari_adi),
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: 'Tür',
      dataIndex: 'cari_turu',
      key: 'cari_turu',
      width: 80,
      render: (tur: string) => (
        <Tag
          color={tur === 'uye' ? 'blue' : 'orange'}
          icon={tur === 'uye' ? <TeamOutlined /> : <ShopOutlined />}
          style={{ borderRadius: '4px', padding: '2px 8px' }}
        >
          {tur === 'uye' ? 'ÜYE' : 'FİRMA'}
        </Tag>
      ),
      filters: [
        { text: 'Üye', value: 'uye' },
        { text: 'Firma', value: 'firma' },
      ],
      onFilter: (value: any, record: MizanData) => record.cari_turu === value,
    },
    {
      title: 'Toplam Borç',
      dataIndex: 'toplam_borc',
      key: 'toplam_borc',
      align: 'right' as const,
      width: 120,
      render: (v: number) => <MoneyDisplay amount={v} />,
      sorter: (a: MizanData, b: MizanData) => a.toplam_borc - b.toplam_borc
    },
    {
      title: 'Toplam Alacak',
      dataIndex: 'toplam_alacak',
      key: 'toplam_alacak',
      align: 'right' as const,
      width: 120,
      render: (v: number) => <MoneyDisplay amount={v} />,
      sorter: (a: MizanData, b: MizanData) => a.toplam_alacak - b.toplam_alacak
    },
    {
      title: 'Bakiye',
      dataIndex: 'bakiye',
      key: 'bakiye',
      align: 'right' as const,
      width: 130,
      render: (v: number) => {
        // Pozitifler yeşil/mavi (Alacak Bakiyesi), negatifler kırmızı (Borç Bakiyesi)
        const isPositive = v > 0;
        const isNegative = v < 0;
        const color = isPositive ? '#1890ff' : (isNegative ? '#ff4d4f' : 'inherit');
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Text strong style={{ color, fontSize: '14px' }}>
              <MoneyDisplay amount={v} colored={false} />
            </Text>
            {isPositive && <Text type="secondary" style={{ fontSize: '10px' }}>ALACAK BAKİYESİ (A)</Text>}
            {isNegative && <Text type="secondary" style={{ fontSize: '10px' }}>BORÇ BAKİYESİ (B)</Text>}
          </div>
        )
      },
      sorter: (a: MizanData, b: MizanData) => a.bakiye - b.bakiye
    }
  ]

  if (!activeProject) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div className="animate-in fade-in duration-500">
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card variant="borderless" className="shadow-sm" style={{ borderRadius: '12px', borderLeft: '4px solid #1890ff' }}>
            <Statistic
              title={<Text type="secondary">Toplam Alacağımız (Borçlu Üyeler/Firmalar)</Text>}
              value={stats.totalWeAreOwed}
              precision={2}
              prefix={<ArrowUpOutlined style={{ color: '#1890ff' }} />}
              styles={{ 
                content: { color: '#1890ff', fontWeight: 800, fontSize: '24px' }
              }}
              formatter={(v) => trMoneyFormatter(v as number)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card variant="borderless" className="shadow-sm" style={{ borderRadius: '12px', borderLeft: '4px solid #ff4d4f' }}>
            <Statistic
              title={<Text type="secondary">Toplam Borçlu Olduğumuz (Alacaklı Firmalar/Üyeler)</Text>}
              value={stats.totalWeOwe}
              precision={2}
              prefix={<ArrowDownOutlined style={{ color: '#ff4d4f' }} />}
              styles={{ 
                content: { color: '#ff4d4f', fontWeight: 800, fontSize: '24px' }
              }}
              formatter={(v) => trMoneyFormatter(v as number)}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        size="small" 
        title={<Space><FileSearchOutlined /> Mizan Listesi</Space>}
        className="shadow-sm"
        style={{ borderRadius: '12px' }}
      >
        <DataTable
          hideCard
          dataSource={list || []}
          columns={columns}
          rowKey="id"
          size="middle"
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '500'],
            position: ['bottomRight']
          }}
          emptyDescription="Bu projede mizan kaydı yok"
          scroll={{ x: 800 }}
          summary={() => {
            // 20260525160000 — Mizan bug fix:
            // Onceden summary `pageData` uzerinden hesapliyordu — Ant Design'in
            // current page + filter subset'i. Bu, ust kartlarla (tum `list`
            // uzerinden) tutarsizlik yaratiyordu (kullanici sikayeti).
            // Cozum: summary de tum `list` uzerinden hesaplar — filtre ve
            // sayfalama'dan bagimsiz, ust kartlarla birebir tutarli.
            const source = list || []
            let totalB = 0
            let totalA = 0
            let totalNet = 0
            source.forEach(({ toplam_borc, toplam_alacak, bakiye }) => {
              totalB += toplam_borc
              totalA += toplam_alacak
              totalNet += bakiye
            })

            return (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                  <Table.Summary.Cell index={0} colSpan={2}>GENEL TOPLAM</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <MoneyDisplay amount={totalB} />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <MoneyDisplay amount={totalA} />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Text strong style={{ color: totalNet > 0 ? '#1890ff' : (totalNet < 0 ? '#ff4d4f' : 'inherit') }}>
                        <MoneyDisplay amount={totalNet} />
                      </Text>
                    </div>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
        />
      </Card>
    </div>
  )
}

export default MizanPage;
