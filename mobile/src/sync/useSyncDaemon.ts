import NetInfo from '@react-native-community/netinfo'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultSyncPolicy, getSyncPolicy, queueCount, setSyncPolicy } from '../db/store'
import type { SyncPolicyRecord } from '../types'
import { syncNow, type SyncSummary } from './syncEngine'

interface SyncState {
  syncing: boolean
  queueSize: number
  lastSyncAt: string | null
  lastError: string | null
  lastSkipReason: string | null
  policy: SyncPolicyRecord
}

interface RunSyncOptions {
  force?: boolean
  reason?: 'manual' | 'interval' | 'connectivity'
}

const parseClockMinutes = (value: string | null): number | null => {
  if (!value) {
    return null
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour * 60 + minute
}

const isWithinSyncWindow = (policy: SyncPolicyRecord): boolean => {
  const start = parseClockMinutes(policy.window_start)
  const end = parseClockMinutes(policy.window_end)
  if (start === null || end === null) {
    return true
  }
  if (start === end) {
    return true
  }

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (start < end) {
    return nowMinutes >= start && nowMinutes <= end
  }

  return nowMinutes >= start || nowMinutes <= end
}

const normalizePolicy = (candidate: SyncPolicyRecord): SyncPolicyRecord => ({
  background_enabled: candidate.background_enabled,
  interval_seconds: Math.min(600, Math.max(15, Math.round(candidate.interval_seconds))),
  max_runs_per_minute: Math.min(60, Math.max(1, Math.round(candidate.max_runs_per_minute))),
  window_start: candidate.window_start?.trim() ? candidate.window_start.trim() : null,
  window_end: candidate.window_end?.trim() ? candidate.window_end.trim() : null,
})

export const useSyncDaemon = (token: string | null, organizationId: number | null) => {
  const [state, setState] = useState<SyncState>({
    syncing: false,
    queueSize: 0,
    lastSyncAt: null,
    lastError: null,
    lastSkipReason: null,
    policy: defaultSyncPolicy,
  })

  const policyRef = useRef<SyncPolicyRecord>(state.policy)
  const recentRunsRef = useRef<number[]>([])

  const refreshQueueSize = useCallback(() => {
    setState((current) => ({
      ...current,
      queueSize: queueCount(),
    }))
  }, [])

  const refreshPolicy = useCallback(() => {
    const next = normalizePolicy(getSyncPolicy())
    policyRef.current = next
    setState((current) => ({
      ...current,
      policy: next,
    }))
  }, [])

  const updatePolicy = useCallback((next: SyncPolicyRecord) => {
    const normalized = normalizePolicy(next)
    setSyncPolicy(normalized)
    policyRef.current = normalized
    setState((current) => ({
      ...current,
      policy: normalized,
    }))
  }, [])

  const runSync = useCallback(
    async (options: RunSyncOptions = {}): Promise<SyncSummary | null> => {
      if (!token || !organizationId) {
        refreshQueueSize()
        return null
      }

      const connection = await NetInfo.fetch()
      if (!connection.isConnected) {
        refreshQueueSize()
        return null
      }

      const force = Boolean(options.force)
      const reason = options.reason ?? 'manual'
      const policy = policyRef.current ?? defaultSyncPolicy

      if (!force && reason !== 'manual' && !policy.background_enabled) {
        setState((current) => ({
          ...current,
          queueSize: queueCount(),
          lastSkipReason: 'Background sync disabled by policy.',
        }))
        return null
      }

      if (!force && reason !== 'manual' && !isWithinSyncWindow(policy)) {
        setState((current) => ({
          ...current,
          queueSize: queueCount(),
          lastSkipReason: 'Outside configured sync window.',
        }))
        return null
      }

      if (!force && reason !== 'manual') {
        const nowMs = Date.now()
        const minAllowed = nowMs - 60000
        recentRunsRef.current = recentRunsRef.current.filter((ts) => ts >= minAllowed)
        if (recentRunsRef.current.length >= policy.max_runs_per_minute) {
          setState((current) => ({
            ...current,
            queueSize: queueCount(),
            lastSkipReason: 'Background sync throttled by max runs/minute.',
          }))
          return null
        }
      }

      setState((current) => ({
        ...current,
        syncing: true,
        lastError: null,
      }))

      try {
        recentRunsRef.current.push(Date.now())
        const summary = await syncNow(token, organizationId)
        setState((current) => ({
          ...current,
          syncing: false,
          queueSize: queueCount(),
          lastSyncAt: new Date().toISOString(),
          lastSkipReason: null,
        }))

        return summary
      } catch (error) {
        setState((current) => ({
          ...current,
          syncing: false,
          queueSize: queueCount(),
          lastError: error instanceof Error ? error.message : String(error),
        }))
        return null
      }
    },
    [token, organizationId, refreshQueueSize],
  )

  useEffect(() => {
    refreshQueueSize()
    refreshPolicy()
  }, [refreshQueueSize, refreshPolicy])

  useEffect(() => {
    if (!token || !organizationId) {
      return
    }

    const intervalMs = Math.max(15000, state.policy.interval_seconds * 1000)
    const interval = setInterval(() => {
      void runSync({ reason: 'interval' })
    }, intervalMs)

    const unsubscribe = NetInfo.addEventListener((networkState) => {
      if (networkState.isConnected) {
        void runSync({ reason: 'connectivity' })
      }
    })

    void runSync({ reason: 'interval' })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [token, organizationId, runSync, state.policy.interval_seconds])

  return {
    ...state,
    runSync,
    refreshQueueSize,
    refreshPolicy,
    updatePolicy,
  }
}
