import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../stores';
import { useT } from '../../i18n';
import { useMediaObjectUrl } from '../../utils/mediaUrl';

export function MediaPlayerOverlay() {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const { playingMedia, stopMediaPlayback, showToast } = useUIStore();
  const playingCard = playingMedia?.card;
  const mediaUrl = useMediaObjectUrl(
    playingCard?.type === 'video' ? playingCard.videoData : playingCard?.type === 'audio' ? playingCard.audioData : undefined
  );

  // Wiedergabezustand zurücksetzen, sobald kein Medium mehr aktiv ist (state-adjust during render)
  const [hadMedia, setHadMedia] = useState(!!playingMedia);
  if (!!playingMedia !== hadMedia) {
    setHadMedia(!!playingMedia);
    if (!playingMedia) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }

  // Auto-play when media is set
  useEffect(() => {
    if (!playingMedia) return;

    const startPlayback = async () => {
      if (playingMedia.card.type === 'video' && videoRef.current) {
        try {
          if (videoRef.current.readyState < 2) {
            await new Promise<void>((resolve, reject) => {
              const video = videoRef.current!;
              const onCanPlay = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('error', onError);
                resolve();
              };
              const onError = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('error', onError);
                reject(new Error('Video could not be loaded'));
              };
              video.addEventListener('canplay', onCanPlay);
              video.addEventListener('error', onError);
              video.load();
            });
          }
          await videoRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          console.error('Video playback error:', error);
          showToast(t('Video kann nicht abgespielt werden'));
          stopMediaPlayback();
        }
      } else if (playingMedia.card.type === 'audio' && audioRef.current) {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          console.error('Audio playback error:', error);
          showToast(t('Audio kann nicht abgespielt werden'));
          stopMediaPlayback();
        }
      }
    };

    // Small delay to ensure element is mounted
    const timer = setTimeout(startPlayback, 100);
    return () => clearTimeout(timer);
  }, [playingMedia, showToast, stopMediaPlayback, t]);

  // Update current time for audio progress
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [playingMedia]);

  if (!playingMedia) return null;

  const { card, screenPosition, screenSize } = playingMedia;

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopMediaPlayback();
  };

  const handleEnded = () => {
    setIsPlaying(false);
    stopMediaPlayback();
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const duration = card.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Backdrop to catch clicks outside */}
      <div
        className="absolute inset-0 pointer-events-auto bg-black/20"
        onClick={handleStop}
      />

      {/* Media player container */}
      <div
        className="absolute pointer-events-auto rounded-2xl overflow-hidden shadow-2xl"
        style={{
          left: screenPosition.x,
          top: screenPosition.y,
          width: screenSize.width,
          height: screenSize.height,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {card.type === 'video' ? (
          <div className="relative w-full h-full bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
              onEnded={handleEnded}
              onError={() => {
                showToast(t('Video kann nicht geladen werden'));
                stopMediaPlayback();
              }}
            >
              <source src={mediaUrl} type={card.mimeType || 'video/mp4'} />
              <source src={mediaUrl} />
            </video>

            {/* Stop button overlay */}
            <button
              onClick={handleStop}
              className="absolute inset-0 flex items-center justify-center bg-transparent hover:bg-black/20 transition-colors"
            >
              {isPlaying && (
                <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <svg className="w-7 h-7 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                </div>
              )}
            </button>

            {/* Duration badge */}
            {card.duration && (
              <div className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-sm">
                {formatDuration(card.duration)}
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-full h-full bg-indigo-100 flex flex-col items-center justify-center p-4">
            <audio
              ref={audioRef}
              preload="metadata"
              onEnded={handleEnded}
              onError={() => {
                showToast(t('Audio kann nicht geladen werden'));
                stopMediaPlayback();
              }}
            >
              <source src={mediaUrl} type={card.mimeType || 'audio/mp4'} />
              <source src={mediaUrl} />
            </audio>

            {/* Stop button */}
            <button
              onClick={handleStop}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors"
            >
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </button>

            {/* Progress bar */}
            <div className="w-full mt-4 px-2">
              <div className="bg-gray-300 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-600">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
