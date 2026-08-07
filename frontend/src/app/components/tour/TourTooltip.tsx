import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Map } from 'lucide-react';
import type { TourStep } from './tourSteps';
import type { SpotlightRect } from './TourSpotlight';

interface TourTooltipProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  spotlightRect: SpotlightRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  allSteps: TourStep[];
}

const TOOLTIP_WIDTH = 340;
const TOOLTIP_OFFSET = 18;

function computePosition(
  rect: SpotlightRect | null,
  preferred: TourStep['position'],
  tooltipHeight: number,
): { x: number; y: number; arrowSide: 'top' | 'bottom' | 'left' | 'right' | null } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollY = window.scrollY;

  if (!rect || preferred === 'center') {
    return {
      x: (vw - TOOLTIP_WIDTH) / 2,
      y: scrollY + (vh - tooltipHeight) / 2,
      arrowSide: null,
    };
  }

  const PADDING = 8;
  const elTop = rect.top - PADDING;
  const elLeft = rect.left - PADDING;
  const elWidth = rect.width + PADDING * 2;
  const elHeight = rect.height + PADDING * 2;
  const elBottom = elTop + elHeight;
  const elRight = elLeft + elWidth;
  const elCenterX = elLeft + elWidth / 2;
  const elCenterY = elTop + elHeight / 2;

  const SAFE_MARGIN = 16;

  type Candidate = { x: number; y: number; arrowSide: 'top' | 'bottom' | 'left' | 'right' | null; fits: boolean };

  const candidates: Record<string, Candidate> = {
    bottom: {
      x: Math.max(SAFE_MARGIN, Math.min(elCenterX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - SAFE_MARGIN)),
      y: elBottom + TOOLTIP_OFFSET,
      arrowSide: 'top',
      fits: elBottom + TOOLTIP_OFFSET + tooltipHeight + SAFE_MARGIN < scrollY + vh,
    },
    top: {
      x: Math.max(SAFE_MARGIN, Math.min(elCenterX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - SAFE_MARGIN)),
      y: elTop - TOOLTIP_OFFSET - tooltipHeight,
      arrowSide: 'bottom',
      fits: elTop - TOOLTIP_OFFSET - tooltipHeight > scrollY + SAFE_MARGIN,
    },
    right: {
      x: Math.min(elRight + TOOLTIP_OFFSET, vw - TOOLTIP_WIDTH - SAFE_MARGIN),
      y: Math.max(scrollY + SAFE_MARGIN, Math.min(elCenterY - tooltipHeight / 2, scrollY + vh - tooltipHeight - SAFE_MARGIN)),
      arrowSide: 'left',
      fits: elRight + TOOLTIP_OFFSET + TOOLTIP_WIDTH + SAFE_MARGIN < vw,
    },
    left: {
      x: Math.max(SAFE_MARGIN, elLeft - TOOLTIP_OFFSET - TOOLTIP_WIDTH),
      y: Math.max(scrollY + SAFE_MARGIN, Math.min(elCenterY - tooltipHeight / 2, scrollY + vh - tooltipHeight - SAFE_MARGIN)),
      arrowSide: 'right',
      fits: elLeft - TOOLTIP_OFFSET - TOOLTIP_WIDTH > SAFE_MARGIN,
    },
  };

  const order: string[] = [preferred as string, 'bottom', 'top', 'right', 'left'];
  for (const pos of order) {
    const c = candidates[pos];
    if (c && c.fits) return { x: c.x, y: c.y, arrowSide: c.arrowSide };
  }

  // fallback: center of screen
  return {
    x: (vw - TOOLTIP_WIDTH) / 2,
    y: scrollY + (vh - tooltipHeight) / 2,
    arrowSide: null,
  };
}

export function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  spotlightRect,
  onNext,
  onPrev,
  onSkip,
  allSteps,
}: TourTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -9999, y: -9999 });
  const [arrowSide, setArrowSide] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Group steps by pageLabel for progress map
  const pages = Array.from(new Set(allSteps.map(s => s.pageLabel)));
  const currentPage = step.pageLabel;

  useEffect(() => {
    const measure = () => {
      const h = ref.current?.offsetHeight ?? 200;
      const { x, y, arrowSide: arrow } = computePosition(spotlightRect, step.position, h);
      setPos({ x, y });
      setArrowSide(arrow);
    };

    const frame = requestAnimationFrame(measure);
    const handleResize = () => requestAnimationFrame(measure);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [spotlightRect, step]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onNext, onPrev, onSkip]);

  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <>
      {/* Clickable backdrop for skip */}
      <div
        className="fixed inset-0 z-[202]"
        onClick={onSkip}
        style={{ cursor: 'default' }}
      />

      <motion.div
        ref={ref}
        key={step.id}
        initial={{ opacity: 0, scale: 0.94, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -4 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[203] select-none"
        style={{
          width: `${TOOLTIP_WIDTH}px`,
          left: `${pos.x}px`,
          top: `${pos.y}px`,
        }}
      >
        <div className="relative bg-white rounded-2xl shadow-[0_24px_64px_-12px_rgba(0,0,0,0.22)] border border-slate-100 overflow-hidden">
          {/* Arrow */}
          {arrowSide && (
            <div
              className="absolute w-3 h-3 bg-white border-slate-100 rotate-45 z-[-1]"
              style={{
                ...(arrowSide === 'top' && { top: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', borderTop: '1px solid', borderLeft: '1px solid' }),
                ...(arrowSide === 'bottom' && { bottom: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', borderBottom: '1px solid', borderRight: '1px solid' }),
                ...(arrowSide === 'left' && { left: '-6px', top: '50%', transform: 'translateY(-50%) rotate(45deg)', borderBottom: '1px solid', borderLeft: '1px solid' }),
                ...(arrowSide === 'right' && { right: '-6px', top: '50%', transform: 'translateY(-50%) rotate(45deg)', borderTop: '1px solid', borderRight: '1px solid' }),
              }}
            />
          )}

          {/* Progress bar */}
          <div className="h-[3px] bg-slate-100 w-full">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>

          <div className="p-5">
            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl leading-none">{step.icon}</span>
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full">
                    {step.pageLabel}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMap(v => !v)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  title="View tour map"
                  aria-label="Show tour map"
                >
                  <Map className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onSkip}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  title="Skip tour (Esc)"
                  aria-label="Skip tour"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tour map dropdown */}
            {showMap && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 bg-slate-50 rounded-xl p-3 border border-slate-100"
              >
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tour Progress</p>
                <div className="flex flex-wrap gap-1.5">
                  {pages.map(page => {
                    const pageSteps = allSteps.filter(s => s.pageLabel === page);
                    const currentInPage = pageSteps.findIndex(s => s.id === step.id);
                    const isDone = allSteps.findIndex(s => s.id === step.id) >= allSteps.findIndex(s => s.pageLabel === page) + pageSteps.length;
                    const isCurrent = page === currentPage;
                    return (
                      <span
                        key={page}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${
                          isCurrent
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : isDone
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        {isCurrent && currentInPage >= 0 ? `${page} ${currentInPage + 1}/${pageSteps.length}` : page}
                      </span>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Title */}
            <h3 className="text-[15px] font-bold text-slate-900 mb-2 leading-snug">
              {step.title}
            </h3>

            {/* Description */}
            <p className="text-[13px] text-slate-500 leading-relaxed mb-5">
              {step.description}
            </p>

            {/* Step counter + navigation */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">
                {stepIndex + 1} <span className="text-slate-300">/</span> {totalSteps}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={onPrev}
                  disabled={isFirst}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-xl transition-all ${
                    isFirst
                      ? 'text-transparent cursor-default'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  aria-label="Previous step"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>

                <button
                  onClick={onNext}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-bold rounded-xl transition-all active:scale-95 ${
                    isLast
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
                  }`}
                  aria-label={isLast ? 'Finish tour' : 'Next step'}
                >
                  {isLast ? 'Finish 🎉' : (<>Next <ChevronRight className="w-3.5 h-3.5" /></>)}
                </button>
              </div>
            </div>

            {/* Keyboard hint */}
            <p className="text-center text-[10px] text-slate-300 mt-3">
              ← → keys to navigate · Esc to skip
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}
