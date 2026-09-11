import React, { useEffect, useState } from 'react';
import { Check, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

interface ExtractionLoadingViewProps {
  onComplete?: () => void;
  statusMessage?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
}

export const ExtractionLoadingView: React.FC<ExtractionLoadingViewProps> = ({
  statusMessage,
  errorMessage,
  onRetry,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    'Scanning uploaded Question Paper & structure...',
    'Separating sub-parts into separate entries (e.g., 11 a, 11 b)...',
    'Transcribing handwritten answers from uploaded student paper...',
    'Analyzing answer accuracy, mapping page regions & generating AI feedback...',
  ];

  useEffect(() => {
    if (errorMessage) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 2400);

    return () => clearInterval(timer);
  }, [errorMessage, steps.length]);

  return (
    <div
      id="extraction-loading-view"
      className="flex-1 flex flex-col items-center justify-center p-8 min-h-[calc(100vh-6rem)] w-full select-none"
    >
      <div className="flex flex-col items-center max-w-md text-center">
        {/* Animated 4-Point Coral Stars */}
        {!errorMessage ? (
          <div className="relative w-32 h-32 flex items-center justify-center mb-8">
            {/* Main Large Sparkle Star */}
            <div className="relative animate-spin" style={{ animationDuration: '6s' }}>
              <svg
                className="w-20 h-20 text-orange-500 drop-shadow-md"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            </div>

            {/* Secondary smaller star at top right */}
            <div className="absolute top-2 right-2 animate-pulse">
              <svg
                className="w-10 h-10 text-orange-400 drop-shadow-sm"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            </div>

            {/* Small dot/satellite */}
            <div className="absolute -bottom-1 left-4 w-3.5 h-3.5 rounded-full bg-orange-400/90 animate-ping"></div>
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center mb-6 shadow-sm">
            <AlertCircle className="w-8 h-8" />
          </div>
        )}

        {/* Headline */}
        {!errorMessage ? (
          <>
            <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight mb-2">
              Extracting...
            </h2>
            <p className="text-neutral-500 text-sm font-normal mb-8">
              {statusMessage || 'Parsing uploaded document with Gemini 3.7 AI... This may take a few seconds'}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold text-rose-900 tracking-tight mb-2">
              Extraction Failed
            </h2>
            <p className="text-neutral-600 text-sm font-normal mb-6 max-w-sm">
              {errorMessage}
            </p>
            <div className="flex items-center gap-3 mb-8">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Extraction</span>
                </button>
              )}
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Upload</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Live Step Progress Box */}
        {!errorMessage && (
          <>
            <div className="w-full bg-white border border-neutral-200/90 rounded-2xl p-4 shadow-2xs flex flex-col gap-2.5 text-left">
              {steps.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isCurrent = idx === currentStep;

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 text-xs transition-opacity duration-300 ${
                      isCompleted
                        ? 'text-emerald-700 font-medium opacity-90'
                        : isCurrent
                        ? 'text-orange-600 font-bold opacity-100'
                        : 'text-neutral-400 opacity-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-700'
                          : isCurrent
                          ? 'bg-orange-100 text-orange-600 animate-pulse'
                          : 'bg-neutral-100 text-neutral-400'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className="truncate">{step}</span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-neutral-200 h-1.5 rounded-full mt-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-400 to-orange-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                }}
              ></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
