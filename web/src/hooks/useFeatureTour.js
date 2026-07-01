import { useEffect } from 'react';
import Shepherd from 'shepherd.js';
import 'shepherd.js/dist/css/shepherd.css';
import { api } from '../api/client';
export const useFeatureTour = ({ tourKey, enabled, steps }) => {
    useEffect(() => {
        if (!enabled || steps.length === 0) {
            return;
        }
        let tour = null;
        let disposed = false;
        const run = async () => {
            try {
                const response = await api.get(`/api/onboarding/${tourKey}`);
                const progress = response.data.data;
                if (progress?.completed_at || progress?.skipped_at || disposed) {
                    return;
                }
                tour = new Shepherd.Tour({
                    useModalOverlay: true,
                    defaultStepOptions: {
                        classes: 'shepherd-theme-arrows',
                        scrollTo: true,
                        cancelIcon: { enabled: true },
                    },
                });
                steps.forEach((step, index) => {
                    const isFirst = index === 0;
                    const isLast = index === steps.length - 1;
                    tour?.addStep({
                        id: step.id,
                        title: step.title,
                        text: step.text,
                        attachTo: step.attachTo,
                        buttons: [
                            ...(!isFirst ? [{ text: 'Back', action: () => tour?.back() }] : []),
                            ...(isLast
                                ? [{ text: 'Finish', action: () => tour?.complete() }]
                                : [{ text: 'Next', action: () => tour?.next() }]),
                        ],
                    });
                });
                tour.on('show', async (event) => {
                    const step = event.step;
                    const index = tour?.steps.indexOf(step) ?? 0;
                    try {
                        await api.put(`/api/onboarding/${tourKey}`, { current_step: index });
                    }
                    catch {
                        // no-op when onboarding update is not permitted
                    }
                });
                tour.on('complete', async () => {
                    try {
                        await api.put(`/api/onboarding/${tourKey}`, { completed: true, current_step: tour?.steps.length ?? 0 });
                    }
                    catch {
                        // no-op when onboarding update is not permitted
                    }
                });
                tour.on('cancel', async () => {
                    try {
                        await api.put(`/api/onboarding/${tourKey}`, { skipped: true });
                    }
                    catch {
                        // no-op when onboarding update is not permitted
                    }
                });
                tour.start();
            }
            catch {
                // no-op if onboarding API unavailable
            }
        };
        void run();
        return () => {
            disposed = true;
            tour?.cancel();
            tour = null;
        };
    }, [enabled, steps, tourKey]);
};
