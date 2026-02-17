import React, { createContext, useContext, useMemo } from 'react'
import type { SyncPolicyRecord } from '../types'
import { useAuth } from '../providers/AuthProvider'
import { useSyncDaemon } from './useSyncDaemon'

interface SyncContextValue {
  syncing: boolean
  queueSize: number
  lastSyncAt: string | null
  lastError: string | null
  lastSkipReason: string | null
  policy: SyncPolicyRecord
  runSync: (options?: { force?: boolean; reason?: 'manual' | 'interval' | 'connectivity' }) => Promise<unknown>
  refreshQueueSize: () => void
  refreshPolicy: () => void
  updatePolicy: (policy: SyncPolicyRecord) => void
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

export const SyncProvider = ({ children }: { children: React.ReactNode }) => {
  const { token, activeOrganization } = useAuth()
  const syncDaemon = useSyncDaemon(token, activeOrganization?.id ?? null)

  const value = useMemo<SyncContextValue>(
    () => ({
      syncing: syncDaemon.syncing,
      queueSize: syncDaemon.queueSize,
      lastSyncAt: syncDaemon.lastSyncAt,
      lastError: syncDaemon.lastError,
      lastSkipReason: syncDaemon.lastSkipReason,
      policy: syncDaemon.policy,
      runSync: syncDaemon.runSync,
      refreshQueueSize: syncDaemon.refreshQueueSize,
      refreshPolicy: syncDaemon.refreshPolicy,
      updatePolicy: syncDaemon.updatePolicy,
    }),
    [
      syncDaemon.syncing,
      syncDaemon.queueSize,
      syncDaemon.lastSyncAt,
      syncDaemon.lastError,
      syncDaemon.lastSkipReason,
      syncDaemon.policy,
      syncDaemon.runSync,
      syncDaemon.refreshQueueSize,
      syncDaemon.refreshPolicy,
      syncDaemon.updatePolicy,
    ],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export const useSync = () => {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSync must be used inside SyncProvider')
  }

  return context
}
