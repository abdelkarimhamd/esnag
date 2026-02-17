import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Box, IconButton, List, ListItem, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { subscribeOrganizationChannel } from '../realtime/echo'

interface NotificationRecord {
  id: string
  type: string
  data: Record<string, unknown>
  read_at?: string | null
  created_at: string
}

const notificationText = (notification: NotificationRecord) => {
  const category = String(notification.data.type ?? notification.type)

  if (category === 'snag_assigned') {
    return {
      primary: `Assigned: ${String(notification.data.snag_reference ?? 'Snag')}`,
      secondary: String(notification.data.snag_title ?? 'A snag was assigned to you.'),
    }
  }

  if (category === 'snag_status_changed') {
    return {
      primary: `Status updated: ${String(notification.data.snag_reference ?? 'Snag')}`,
      secondary: `${String(notification.data.from_status ?? 'unknown')} -> ${String(notification.data.to_status ?? 'unknown')}`,
    }
  }

  if (category === 'snag_comment_added') {
    return {
      primary: `Comment: ${String(notification.data.snag_reference ?? 'Snag')}`,
      secondary: 'New comment added to snag.',
    }
  }

  if (category === 'snag_mentioned') {
    return {
      primary: `Mentioned: ${String(notification.data.snag_reference ?? 'Snag')}`,
      secondary: String(notification.data.comment_body ?? 'You were mentioned in a snag comment.'),
    }
  }

  if (category === 'snag_escalated') {
    return {
      primary: `Escalated: ${String(notification.data.snag_reference ?? 'Snag')}`,
      secondary: `${String(notification.data.rule_name ?? 'Rule')} · overdue ${String(notification.data.overdue_days ?? '?')} day(s)`,
    }
  }

  if (category === 'export_ready') {
    return {
      primary: `Export ready (${String(notification.data.export_type ?? 'file')})`,
      secondary: String(notification.data.file_name ?? 'Your export is ready for download.'),
    }
  }

  if (category === 'export_failed') {
    return {
      primary: `Export failed (${String(notification.data.export_type ?? 'file')})`,
      secondary: String(notification.data.error_message ?? 'Please retry the export request.'),
    }
  }

  if (category === 'inspection_approval_required') {
    return {
      primary: `Inspection review: ${String(notification.data.inspection_reference ?? 'Inspection')}`,
      secondary: `Step ${String(notification.data.step_order ?? '?')} (${String(notification.data.role_name ?? 'role')})`,
    }
  }

  if (category === 'inspection_signature_requested') {
    return {
      primary: `Signature requested: ${String(notification.data.inspection_reference ?? 'Inspection')}`,
      secondary: `Step ${String(notification.data.step_order ?? '?')} requires digital signature.`,
    }
  }

  if (category === 'inspection_decision') {
    return {
      primary: `Inspection decision: ${String(notification.data.inspection_reference ?? 'Inspection')}`,
      secondary: `Step result: ${String(notification.data.approval_status ?? 'updated')}`,
    }
  }

  return {
    primary: category,
    secondary: 'Update',
  }
}

export const NotificationsMenu = ({ canView }: { canView: boolean }) => {
  const { activeOrganization } = useAuth()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const open = Boolean(anchorEl)

  const loadNotifications = useCallback(async () => {
    if (!canView) {
      return
    }

    const response = await api.get<{ data: NotificationRecord[]; meta: { unread_count: number } }>('/api/notifications')
    setNotifications(response.data.data)
    setUnreadCount(response.data.meta.unread_count)
  }, [canView])

  useEffect(() => {
    if (!canView) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void loadNotifications()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [canView, loadNotifications])

  useEffect(() => {
    if (!canView || !activeOrganization) {
      return
    }

    const unsubscribe = subscribeOrganizationChannel(activeOrganization.id, {
      onSnag: () => {
        void loadNotifications()
      },
      onExport: () => {
        void loadNotifications()
      },
      onInspection: () => {
        void loadNotifications()
      },
    })

    return () => {
      unsubscribe()
    }
  }, [canView, activeOrganization, activeOrganization?.id, loadNotifications])

  const hasUnread = useMemo(() => unreadCount > 0, [unreadCount])

  const openMenu = async (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
    await loadNotifications()
  }

  const closeMenu = () => {
    setAnchorEl(null)
  }

  const markRead = async (notificationId: string) => {
    await api.post(`/api/notifications/${notificationId}/read`)
    await loadNotifications()
  }

  const markAllRead = async () => {
    await api.post('/api/notifications/read-all')
    await loadNotifications()
  }

  if (!canView) {
    return null
  }

  return (
    <>
      <IconButton color="inherit" onClick={openMenu}>
        <Badge color="secondary" badgeContent={hasUnread ? unreadCount : 0}>
          <NotificationsOutlinedIcon />
        </Badge>
      </IconButton>

      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, p: 1 } }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" px={1} pb={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            Notifications
          </Typography>
          <MenuItem onClick={markAllRead} sx={{ minHeight: 32 }}>
            Mark all read
          </MenuItem>
        </Box>

        <List sx={{ maxHeight: 380, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <ListItem>
              <ListItemText primary="No notifications" secondary="You are all caught up." />
            </ListItem>
          ) : (
            notifications.map((notification) => {
              const text = notificationText(notification)

              return (
                <ListItem
                  key={notification.id}
                  sx={{
                    alignItems: 'flex-start',
                    bgcolor: notification.read_at ? 'transparent' : 'rgba(14, 116, 144, 0.08)',
                    borderRadius: 1,
                    mb: 0.5,
                    cursor: notification.read_at ? 'default' : 'pointer',
                  }}
                  onClick={() => {
                    if (!notification.read_at) {
                      void markRead(notification.id)
                    }
                  }}
                >
                  <ListItemText primary={text.primary} secondary={text.secondary} />
                </ListItem>
              )
            })
          )}
        </List>
      </Menu>
    </>
  )
}
