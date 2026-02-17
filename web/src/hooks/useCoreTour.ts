import { useEffect } from 'react'
import Shepherd from 'shepherd.js'
import 'shepherd.js/dist/css/shepherd.css'
import { api } from '../api/client'

interface UseCoreTourOptions {
  enabled: boolean
  includeCreate: boolean
  includeTransition: boolean
}

export const useCoreTour = ({ enabled, includeCreate, includeTransition }: UseCoreTourOptions) => {
  useEffect(() => {
    if (!enabled) {
      return
    }

    let tour: any = null
    let disposed = false

    const run = async () => {
      try {
        const response = await api.get('/api/onboarding/core')
        const progress = response.data.data

        if (progress?.completed_at || progress?.skipped_at) {
          return
        }

        if (disposed) {
          return
        }

        tour = new Shepherd.Tour({
          useModalOverlay: true,
          defaultStepOptions: {
            classes: 'shepherd-theme-arrows',
            scrollTo: true,
            cancelIcon: { enabled: true },
          },
        })

        tour.addStep({
          id: 'projects',
          title: 'Projects Navigation',
          text: 'Start from the Projects area to pick the active project.',
          attachTo: { element: '#projects-nav', on: 'bottom' },
          buttons: [{ text: 'Next', action: tour.next }],
        })

        tour.addStep({
          id: 'drawing',
          title: 'Drawing & Revision',
          text: 'Switch revision to inspect older or current drawings.',
          attachTo: { element: '#drawing-selector', on: 'bottom' },
          buttons: [
            { text: 'Back', action: tour.back },
            { text: 'Next', action: tour.next },
          ],
        })

        if (includeCreate) {
          tour.addStep({
            id: 'create',
            title: 'Create Snag',
            text: 'Click directly on the drawing canvas to place a pin and create a snag.',
            attachTo: { element: '#drawing-canvas', on: 'top' },
            buttons: [
              { text: 'Back', action: tour.back },
              { text: 'Next', action: tour.next },
            ],
          })
        }

        if (includeTransition) {
          tour.addStep({
            id: 'transition',
            title: 'Change Status',
            text: 'Open a snag and transition through workflow states.',
            attachTo: { element: '#status-panel', on: 'left' },
            buttons: [
              { text: 'Back', action: tour.back },
              { text: 'Next', action: tour.next },
            ],
          })
        }

        tour.addStep({
          id: 'history',
          title: 'History Trail',
          text: 'Each status transition is tracked in the history panel.',
          attachTo: { element: '#history-panel', on: 'left' },
          buttons: [
            { text: 'Back', action: tour.back },
            { text: 'Finish', action: tour.complete },
          ],
        })

        tour.on('show', async (event: any) => {
          const step = event.step
          const index = tour?.steps.indexOf(step) ?? 0
          try {
            await api.put('/api/onboarding/core', { current_step: index })
          } catch {
            // no-op when onboarding update is not permitted
          }
        })

        tour.on('complete', async () => {
          try {
            await api.put('/api/onboarding/core', { completed: true, current_step: tour?.steps.length ?? 0 })
          } catch {
            // no-op when onboarding update is not permitted
          }
        })

        tour.on('cancel', async () => {
          try {
            await api.put('/api/onboarding/core', { skipped: true })
          } catch {
            // no-op when onboarding update is not permitted
          }
        })

        tour.start()
      } catch {
        // no-op if onboarding API unavailable
      }
    }

    void run()

    return () => {
      disposed = true
      tour?.cancel()
      tour = null
    }
  }, [enabled, includeCreate, includeTransition])
}

