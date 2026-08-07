import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { getSettings } from '../../../api/client';
import { buildTourSteps } from './buildTourSteps';
import type { TourStep } from './tourSteps';
import { TourSpotlight, type SpotlightRect } from './TourSpotlight';
import { TourTooltip } from './TourTooltip';

interface TourOrchestratorProps {
  onComplete: () => void;
}

export function TourOrchestrator({ onComplete }: TourOrchestratorProps) {
  const { completeOnboarding, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSteps() {
      if (isAdmin) {
        if (!cancelled) setSteps(buildTourSteps({ isAdmin: true }));
        return;
      }
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setSteps(
            buildTourSteps({
              isAdmin: false,
              payrollAllowed: settings.perm_supervisor_salary_view !== 'false',
              canApproveCorrections: settings.perm_supervisor_correction_approve !== 'false',
            }),
          );
        }
      } catch {
        if (!cancelled) {
          setSteps(buildTourSteps({ isAdmin: false, payrollAllowed: false, canApproveCorrections: false }));
        }
      }
    }

    loadSteps();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const currentStep = steps[stepIndex];

  useEffect(() => {
    if (!currentStep) return;
    const targetSearch = currentStep.search ?? '';
    if (location.pathname !== currentStep.route || location.search !== targetSearch) {
      setNavigating(true);
      navigate({ pathname: currentStep.route, search: targetSearch });
    } else {
      setNavigating(false);
    }
  }, [stepIndex, currentStep, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (currentStep && location.pathname === currentStep.route && location.search === (currentStep.search ?? '')) {
      setNavigating(false);
    }
  }, [location.pathname, location.search, currentStep]);

  const handleFinish = useCallback(async () => {
    try {
      await completeOnboarding();
    } catch {
      // still close the tour
    }
    onComplete();
  }, [completeOnboarding, onComplete]);

  const handleNext = useCallback(async () => {
    if (stepIndex < steps.length - 1) {
      setSpotlightRect(null);
      setStepIndex(prev => prev + 1);
    } else {
      await handleFinish();
    }
  }, [stepIndex, steps.length, handleFinish]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      setSpotlightRect(null);
      setStepIndex(prev => prev - 1);
    }
  }, [stepIndex]);

  const handleSpotlightReady = useCallback((rect: SpotlightRect | null) => {
    setSpotlightRect(rect);
  }, []);

  if (!steps.length || !currentStep) return null;

  return (
    <AnimatePresence mode="wait">
      {!navigating && (
        <>
          <TourSpotlight
            key={currentStep.tourId}
            step={currentStep}
            onReady={handleSpotlightReady}
          />
          <TourTooltip
            key={`tooltip-${currentStep.id}`}
            step={currentStep}
            stepIndex={stepIndex}
            totalSteps={steps.length}
            spotlightRect={spotlightRect}
            onNext={handleNext}
            onPrev={handlePrev}
            onSkip={handleFinish}
            allSteps={steps}
          />
        </>
      )}
    </AnimatePresence>
  );
}
