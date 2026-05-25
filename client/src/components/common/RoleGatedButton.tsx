import React from 'react'
import { Button, type ButtonProps } from 'antd'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 5):
 * AntD Button wrapper — `can` false ise butonu disabled yapar ve hover tooltip
 * gösterir. DRY pattern: 24+ sayfadaki `disabled={!canEdit} title={!canEdit ? 'Yetki yok' : ...}`
 * tekrarını tek noktaya toplar; ileri sayfalarda usePermissions flag'ini direkt
 * `can` prop'una geçirip kullanmak yeterli.
 *
 * Kullanım:
 *   const { canEdit } = usePermissions()
 *   <RoleGatedButton can={canEdit} icon={<PlusOutlined />}>Yeni X</RoleGatedButton>
 *
 * Tek farklı render gerekiyorsa (örn. hidden mode):
 *   <RoleGatedButton can={canDelete} hideWhenNo>Sil</RoleGatedButton>
 *
 * Not: react/jsx kuralları gereği `disabled` prop'u override'a kapalı — `can`
 * üzerinden tek kaynağı doğrudur, ek `disabled` props yoksayılır.
 */
export interface RoleGatedButtonProps extends Omit<ButtonProps, 'disabled' | 'title'> {
  /** İzin flag'i — false ise buton disabled + tooltip gösterir. */
  can: boolean
  /** Disabled state'te gösterilecek tooltip; default "Yetkiniz yok". */
  noPermissionTooltip?: string
  /** Authorized state'te gösterilecek hover title (opsiyonel). */
  title?: string
  /** True ise yetki yokken buton gizlenir (disabled yerine). */
  hideWhenNo?: boolean
}

export const RoleGatedButton: React.FC<RoleGatedButtonProps> = ({
  can,
  noPermissionTooltip = 'Yetkiniz yok',
  title,
  hideWhenNo = false,
  children,
  ...buttonProps
}) => {
  if (!can && hideWhenNo) return null
  return (
    <Button
      {...buttonProps}
      disabled={!can || !!buttonProps.loading}
      title={!can ? noPermissionTooltip : title}
    >
      {children}
    </Button>
  )
}
