import { useState } from 'react';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useUIStore } from '../../stores';
import { useT } from '../../i18n';

interface PlaybackToolbarProps {
  projectId: string;
}

// Wiedergabe-Leiste für die Lernspur (wie iOS playbackToolbar):
// Play/Pause, Fortschritt, Geschwindigkeit, Zeitmaschine
export function PlaybackToolbar({ projectId }: PlaybackToolbarProps) {
  const {
    isPlaying,
    currentStep,
    events,
    speed,
    play,
    pause,
    restart,
    stop,
    cycleSpeed,
    timeTravel,
  } = usePlaybackStore();
  const { showToast } = useUIStore();
  const t = useT();
  const [confirmTimeTravel, setConfirmTimeTravel] = useState(false);

  const total = events.length;
  const progress = total > 0 ? (currentStep / total) * 100 : 0;
  const isFinished = currentStep >= total;

  const handleTimeTravel = async () => {
    if (!confirmTimeTravel) {
      setConfirmTimeTravel(true);
      return;
    }
    setConfirmTimeTravel(false);
    await timeTravel(projectId);
    showToast(t('Canvas auf diesen Stand zurückgesetzt'));
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 animate-in slide-in-from-bottom-4">
      <div className="bg-white/80 backdrop-blur-md rounded-[20px] shadow-lg px-4 py-3 flex flex-col gap-2 min-w-[340px]">
        {/* Fortschritt */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-ink-soft whitespace-nowrap">
            {t('Schritt {current} / {total}', { current: Math.min(currentStep, total), total })}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-primary-purple/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-purple transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={cycleSpeed}
            className="text-xs font-semibold text-primary-purple bg-primary-purple/10 rounded-full px-2.5 py-1 active:scale-95 transition-transform"
            aria-label={t('Geschwindigkeit ändern')}
          >
            {speed}×
          </button>
        </div>

        {/* Steuerung */}
        <div className="flex items-center justify-center gap-1.5">
          <PlaybackButton
            label={t('Neustart')}
            onClick={() => { setConfirmTimeTravel(false); restart(); }}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M4 9a8 8 0 108-5" />
              </svg>
            }
          />
          <PlaybackButton
            label={isPlaying ? t('Pause') : t('Abspielen')}
            primary
            onClick={() => { setConfirmTimeTravel(false); if (isPlaying) { pause(); } else { play(); } }}
            icon={
              isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="7" y="5" width="3.5" height="14" rx="1" />
                  <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.5v13a1 1 0 001.54.84l10-6.5a1 1 0 000-1.68l-10-6.5A1 1 0 008 5.5z" />
                </svg>
              )
            }
          />
          <PlaybackButton
            label={t('Beenden')}
            onClick={() => { setConfirmTimeTravel(false); stop(); }}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            }
          />
        </div>

        {/* Zeitmaschine (nur bei Pause/Ende, wie iOS) */}
        {!isPlaying && (currentStep > 0 || isFinished) && (
          <div className="flex items-center justify-center gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={() => stop()}
              className="text-xs font-semibold text-primary-blue rounded-full px-3 py-1.5 hover:bg-primary-blue/10 active:scale-95 transition-all"
            >
              {t('Hier weitermachen')}
            </button>
            <button
              onClick={handleTimeTravel}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 active:scale-95 transition-all ${
                confirmTimeTravel
                  ? 'bg-primary-orange text-white'
                  : 'text-primary-orange hover:bg-primary-orange/10'
              }`}
            >
              {confirmTimeTravel ? t('Wirklich zurücksetzen?') : t('Neustart ab hier')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface PlaybackButtonProps {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
}

function PlaybackButton({ icon, label, primary = false, onClick }: PlaybackButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-all ${
        primary
          ? 'bg-primary-purple text-white shadow-[0_4px_10px_rgba(176,136,249,0.4)]'
          : 'text-ink-soft hover:bg-black/5'
      }`}
    >
      {icon}
    </button>
  );
}
