import React from 'react'
import { Select, Space, Typography } from 'antd'
import { ProjectOutlined } from '@ant-design/icons'
import { useProject } from '../../contexts/ProjectContext'

const { Text } = Typography

export const ProjectSelector: React.FC = () => {
  const { projects, activeProject, setActiveProject, loading } = useProject()

  if (loading) return null

  return (
    <Space size="middle" style={{ marginRight: 24 }}>
      <Text type="secondary" style={{ fontSize: 13 }}>Aktif Proje:</Text>
      <Select
        value={activeProject?.id}
        placeholder="Proje Seçin"
        style={{ width: 220 }}
        onChange={(value) => {
          const project = projects.find((p) => p.id === value)
          setActiveProject(project || null)
          // Sayfayı yenile ki tüm veriler yeni proje ile çekilsin
          window.location.reload()
        }}
        dropdownStyle={{ minWidth: 250 }}
      >
        {projects.map((project) => (
          <Select.Option key={project.id} value={project.id}>
            <Space>
              <ProjectOutlined style={{ color: '#4f46e5' }} />
              {project.proje_adi}
            </Space>
          </Select.Option>
        ))}
      </Select>
    </Space>
  )
}
