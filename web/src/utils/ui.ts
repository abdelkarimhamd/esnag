import type { ChipProps } from '@mui/material'
import type { SnagPriority, SnagStatus } from '../types'

const tokenToLabel = (token: string) =>
  token
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

export const formatStatusLabel = (status: string) => tokenToLabel(status)

export const formatPriorityLabel = (priority: string) => tokenToLabel(priority)

export const snagStatusChipColor = (status: SnagStatus): ChipProps['color'] => {
  if (status === 'closed') {
    return 'success'
  }
  if (status === 'rejected') {
    return 'error'
  }
  if (status === 'ready_for_review') {
    return 'warning'
  }
  if (status === 'in_progress') {
    return 'secondary'
  }
  if (status === 'assigned') {
    return 'primary'
  }

  return 'default'
}

export const snagPriorityChipColor = (priority: SnagPriority): ChipProps['color'] => {
  if (priority === 'critical') {
    return 'error'
  }
  if (priority === 'high') {
    return 'warning'
  }
  if (priority === 'medium') {
    return 'secondary'
  }

  return 'default'
}
