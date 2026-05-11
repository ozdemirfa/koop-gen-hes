import React from 'react'
import { Spin } from 'antd'

interface Props {
  fullHeight?: boolean
  tip?: string
  /** A5-01: inline mode for use inside cards/sections (no min-height) */
  inline?: boolean
}

/**
 * LoadingState — tüm "loading" view'lar için standart component.
 *
 * A5-01 (2026-05-11): Codebase boyunca Spin kullanılıyor; Skeleton hiç. Burada
 * tek noktada Spin merkezlendi. inline prop küçük alanlar için. aria-busy +
 * role="status" eklendi (screen reader desteği).
 */
export const LoadingState: React.FC<Props> = ({ fullHeight = false, tip, inline = false }) => (
  <div
    role="status"
    aria-busy="true"
    aria-live="polite"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: inline ? '12px' : fullHeight ? '80px 20px' : '40px 20px',
      minHeight: fullHeight ? 320 : undefined,
    }}
  >
    <Spin size={inline ? 'default' : 'large'} tip={tip} />
  </div>
)
