import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { TourStep } from './tourSteps';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourSpotlightProps {
  step: TourStep;
  onReady: (rect: SpotlightRect | null) => void;
}

export function TourSpotlight({ step, onReady }: TourSpotlightProps) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const rafRef = useRef<number | null>(null);

  // Hook 1: Measure target element & set up resize/scroll observers
  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // 2 seconds max

    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.tourId}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const newRect: SpotlightRect = {
          top: r.top + window.scrollY,
          left: r.left + window.scrollX,
          width: r.width,
          height: r.height,
        };
        setRect(newRect);
        onReady(newRect);
      } else if (attempts < MAX_ATTEMPTS) {
        attempts++;
        rafRef.current = requestAnimationFrame(measure);
      } else {
        // Element not found — center fallback
        setRect(null);
        onReady(null);
      }
    };

    // Small delay to let React render the page after route navigation
    const timeout = setTimeout(() => {
      rafRef.current = requestAnimationFrame(measure);
    }, 350);

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Re-measure without the initial delay on resize
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.tourId}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const newRect: SpotlightRect = {
          top: r.top + window.scrollY,
          left: r.left + window.scrollX,
          width: r.width,
          height: r.height,
        };
        setRect(newRect);
        onReady(newRect);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [step.tourId, onReady]);

  // Hook 2: Scroll the element into view — MUST be before any early return (Rules of Hooks)
  useEffect(() => {
    if (!rect) return;
    const PADDING = 8;
    const height = rect.height + PADDING * 2;
    const scrollTarget = rect.top - PADDING - (window.innerHeight - height) / 2;
    window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
  }, [rect]);

  // ── Early return AFTER all hooks ──────────────────────────────────────────
  if (!rect) return null;

  const PADDING = 8;
  const top = rect.top - PADDING;
  const left = rect.left - PADDING;
  const width = rect.width + PADDING * 2;
  const height = rect.height + PADDING * 2;
  const borderRadius = 12;

  return (
    <>
      {/* Dark overlay using clip-path with a cut-out hole over the target */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[200] pointer-events-none"
        style={{
          background: `rgba(0, 0, 0, 0.62)`,
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
            ${left}px ${top}px,
            ${left}px ${top + height}px,
            ${left + width}px ${top + height}px,
            ${left + width}px ${top}px,
            ${left}px ${top}px
          )`,
        }}
      />

      {/* Pulsing highlight ring */}
      <motion.div
        key={step.tourId}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="fixed z-[201] pointer-events-none"
        style={{
          top: `${top}px`,
          left: `${left}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${borderRadius}px`,
          border: '2px solid rgba(59, 130, 246, 0.9)',
          animation: 'tourPulse 2s ease-in-out infinite',
        }}
      />

      {/* Keyframe animation */}
      <style>{`
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 0px rgba(59, 130, 246, 0.7), 0 0 0 4px rgba(59, 130, 246, 0.3), 0 8px 32px rgba(59, 130, 246, 0.35); }
          50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0), 0 0 0 12px rgba(59, 130, 246, 0.12), 0 8px 32px rgba(59, 130, 246, 0.5); }
        }
      `}</style>
    </>
  );
}

export type { SpotlightRect };
