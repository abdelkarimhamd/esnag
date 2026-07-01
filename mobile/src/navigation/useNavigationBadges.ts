import { useCallback, useEffect, useMemo, useState } from 'react'
import { pendingSyncConflictsCount, queueCount } from '../db/store'
import { getBadgesMap } from './navConfig'

interface UseNavigationBadgesOptions {
  queueSizeHint?: number
  lastError?: string | null
}

export const useNavigationBadges = ({ queueSizeHint = 0, lastError = null }: UseNavigationBadgesOptions) => {
  const [queue, setQueue] = useState(() => Math.max(queueSizeHint, queueCount()))
  const [conflicts, setConflicts] = useState(() => pendingSyncConflictsCount())

  const refresh = useCallback(() => {
    setQueue(Math.max(queueSizeHint, queueCount()))
    setConflicts(pendingSyncConflictsCount())
  }, [queueSizeHint])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const timer = setInterval(() => {
      refresh()
    }, 8000)

    return () => {
      clearInterval(timer)
    }
  }, [refresh])

  const notificationAlerts = useMemo(() => {
    let total = conflicts
    if (queue > 0) {
      total += 1
    }
    if (lastError) {
      total += 1
    }
    return total
  }, [conflicts, queue, lastError])

  return {
    refreshBadges: refresh,
    badgesMap: getBadgesMap({
      queueSize: queue,
      pendingConflicts: conflicts,
      notificationAlerts,
    }),
  }
}
