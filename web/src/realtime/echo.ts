import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

declare global {
  interface Window {
    Pusher: typeof Pusher
  }
}

window.Pusher = Pusher

type PayloadHandler = (payload: Record<string, unknown>) => void

interface OrgChannelRegistry {
  channelName: string
  snagHandlers: Set<PayloadHandler>
  dashboardHandlers: Set<PayloadHandler>
  exportHandlers: Set<PayloadHandler>
  inspectionHandlers: Set<PayloadHandler>
}

let echoInstance: Echo<'pusher'> | null = null
const orgChannels = new Map<number, OrgChannelRegistry>()

const resolvePort = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const getEcho = () => {
  if (echoInstance) {
    return echoInstance
  }

  const scheme = (import.meta.env.VITE_WS_SCHEME ?? 'http').toLowerCase()
  const isSecure = scheme === 'https'

  echoInstance = new Echo({
    broadcaster: import.meta.env.VITE_WS_BROADCASTER ?? 'pusher',
    key: import.meta.env.VITE_WS_APP_KEY ?? 'esnagging-key',
    cluster: import.meta.env.VITE_WS_APP_CLUSTER ?? 'mt1',
    wsHost: import.meta.env.VITE_WS_HOST ?? window.location.hostname,
    wsPort: resolvePort(import.meta.env.VITE_WS_PORT, 6001),
    wssPort: resolvePort(import.meta.env.VITE_WS_PORT, 6001),
    forceTLS: isSecure,
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/broadcasting/auth',
    withCredentials: true,
    auth: {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
  })

  return echoInstance
}

export interface OrgRealtimeHandlers {
  onSnag?: PayloadHandler
  onDashboard?: PayloadHandler
  onExport?: PayloadHandler
  onInspection?: PayloadHandler
}

const ensureOrganizationChannel = (organizationId: number) => {
  const existing = orgChannels.get(organizationId)
  if (existing) {
    return existing
  }

  const channelName = `organization.${organizationId}`
  const echo = getEcho()
  const channel = echo.private(channelName)

  const registry: OrgChannelRegistry = {
    channelName,
    snagHandlers: new Set<PayloadHandler>(),
    dashboardHandlers: new Set<PayloadHandler>(),
    exportHandlers: new Set<PayloadHandler>(),
    inspectionHandlers: new Set<PayloadHandler>(),
  }

  channel.listen('.snag.realtime', (payload: Record<string, unknown>) => {
    registry.snagHandlers.forEach((handler) => handler(payload))
  })

  channel.listen('.dashboard.realtime', (payload: Record<string, unknown>) => {
    registry.dashboardHandlers.forEach((handler) => handler(payload))
  })

  channel.listen('.export.realtime', (payload: Record<string, unknown>) => {
    registry.exportHandlers.forEach((handler) => handler(payload))
  })

  channel.listen('.inspection.realtime', (payload: Record<string, unknown>) => {
    registry.inspectionHandlers.forEach((handler) => handler(payload))
  })

  orgChannels.set(organizationId, registry)

  return registry
}

export const subscribeOrganizationChannel = (organizationId: number, handlers: OrgRealtimeHandlers) => {
  const registry = ensureOrganizationChannel(organizationId)

  if (handlers.onSnag) {
    registry.snagHandlers.add(handlers.onSnag)
  }

  if (handlers.onDashboard) {
    registry.dashboardHandlers.add(handlers.onDashboard)
  }

  if (handlers.onExport) {
    registry.exportHandlers.add(handlers.onExport)
  }

  if (handlers.onInspection) {
    registry.inspectionHandlers.add(handlers.onInspection)
  }

  return () => {
    if (handlers.onSnag) {
      registry.snagHandlers.delete(handlers.onSnag)
    }

    if (handlers.onDashboard) {
      registry.dashboardHandlers.delete(handlers.onDashboard)
    }

    if (handlers.onExport) {
      registry.exportHandlers.delete(handlers.onExport)
    }

    if (handlers.onInspection) {
      registry.inspectionHandlers.delete(handlers.onInspection)
    }

    const hasNoHandlers =
      registry.snagHandlers.size === 0 &&
      registry.dashboardHandlers.size === 0 &&
      registry.exportHandlers.size === 0 &&
      registry.inspectionHandlers.size === 0

    if (hasNoHandlers) {
      getEcho().leave(registry.channelName)
      orgChannels.delete(organizationId)
    }
  }
}
