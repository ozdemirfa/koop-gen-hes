import React, { useState } from 'react'
import { Select, Space, Typography, Card, Button, message } from 'antd'
import { ProjectOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useProject } from '../../contexts/ProjectContext'
import { useQueryClient } from '@tanstack/react-query'

const { Text } = Typography

interface ProjectSelectorProps {
  inline?: boolean
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({ inline = false }) => {
  const { projects, activeProject, setActiveProject, loading } = useProject()
  const [selectedId, setSelectedId] = useState<string | undefined>(activeProject?.id)
  const queryClient = useQueryClient()

  if (loading) return null

  if (inline) {
    const handleSetActive = () => {
      if (!selectedId) {
        message.warning('Lütfen bir proje seçin')
        return
      }
      
      if (selectedId === activeProject?.id) {
        message.info('Bu proje zaten aktif')
        return
      }

      const project = projects.find((p) => p.id === selectedId)
      setActiveProject(project || null)
      message.success(`${project?.proje_adi} aktif proje olarak ayarlandı`)
      
      // Sayfayı yenilemek yerine tüm query'leri invalidate et
      // Bu sayede sayfa durumunu kaybetmeden tüm veriler yeni projeye göre güncellenir
      queryClient.invalidateQueries()
    }

    return (
      <Card 
        size="small" 
        style={{ marginBottom: 16, border: '1px solid #e2e8f0', background: '#f8fafc' }} 
        styles={{ body: { padding: '12px 16px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {activeProject ? (
              <div style={{ 
                padding: '6px 16px', 
                background: '#ecfdf5', 
                border: '1px solid #10b981', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircleOutlined style={{ color: '#10b981', fontSize: '16px' }} />
                <Space orientation="vertical" size={0}>
                  <Text strong style={{ color: '#065f46', fontSize: '13px', lineHeight: 1.2 }}>
                    {activeProject.proje_adi}
                  </Text>
                  <Text style={{ color: '#059669', fontSize: '11px', lineHeight: 1 }}>ŞU AN AKTİF</Text>
                </Space>
              </div>
            ) : (
              <Space orientation="vertical" size={0}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ProjectOutlined style={{ color: '#ef4444' }} />
                  <Text strong>Proje Seçilmedi</Text>
                </div>
                <Text type="secondary" style={{ fontSize: '11px' }}>Lütfen bir proje seçerek başlayın</Text>
              </Space>
            )}
          </div>

          <Space wrap>
            <Select
              showSearch
              placeholder="Proje değiştir..."
              style={{ width: 280 }}
              value={selectedId}
              onChange={setSelectedId}
              optionFilterProp="label"
              options={projects
                .filter(p => p.durum !== 'iptal')
                .map(p => ({
                  value: p.id,
                  label: p.proje_adi,
                  disabled: p.id === activeProject?.id
                }))}
              suffixIcon={<ProjectOutlined />}
            />
            <Button 
              type="primary" 
              icon={<ThunderboltOutlined />} 
              onClick={handleSetActive}
              disabled={!selectedId || selectedId === activeProject?.id}
              style={{ color: '#ffffff' }}
            >
              Aktif Proje Yap
            </Button>
          </Space>
        </div>
      </Card>
    )
  }

  return null
}
