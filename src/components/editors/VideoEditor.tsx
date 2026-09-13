import { useState, useRef } from 'react';
import { Modal } from '../common';
import type { VideoCard } from '../../types';
import { useCardsStore, useUIStore } from '../../stores';
import { useT } from '../../i18n';
import { useMediaObjectUrl } from '../../utils/mediaUrl';
import { createVideoThumbnailFromBlob } from '../../utils/videoThumbnail';
import { isNativeVideoTrimAvailable, trimVideoNatively } from '../../utils/nativeBridge';

interface VideoEditorProps {
  card: VideoCard;
}

export function VideoEditor({ card }: VideoEditorProps) {
  const t = useT();
  const videoUrl = useMediaObjectUrl(card.videoData);
  const [label, setLabel] = useState(card.label || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { updateCard, deleteCard } = useCardsStore();
  const { closeModal, showToast } = useUIStore();

  // Bezeichnung beim Kartenwechsel neu laden (state-adjust during render)
  const [prevCardId, setPrevCardId] = useState(card.id);
  if (prevCardId !== card.id) {
    setPrevCardId(card.id);
    setLabel(card.label || '');
  }

  const handleSave = async () => {
    await updateCard(card.id, { label: label || undefined });
    closeModal();
  };

  // In der iOS-App kann das Video wirklich geschnitten werden (System-Videoeditor).
  const canTrimNatively = isNativeVideoTrimAvailable();
  const [isTrimming, setIsTrimming] = useState(false);

  const trimNatively = async () => {
    setIsTrimming(true);
    try {
      const outcome = await trimVideoNatively(card.videoData, card.mimeType);
      // Abbruch und Zeitablauf sagen nichts über das Video aus – still bleiben.
      if (outcome.status === 'cancelled' || outcome.status === 'timeout') return;
      if (outcome.status === 'busy') {
        showToast(t('Es wird schon ein Video geschnitten. Versuche es gleich noch einmal.'));
        return;
      }
      if (outcome.status !== 'ok') {
        showToast(t('Dieses Video lässt sich hier nicht schneiden'));
        return;
      }
      const result = outcome.video;
      let thumbnailData = card.thumbnailData;
      try {
        const blob = await (await fetch(result.videoData)).blob();
        const thumb = await createVideoThumbnailFromBlob(blob);
        if (thumb) thumbnailData = thumb;
      } catch {
        // Vorschaubild ist optional
      }
      await updateCard(card.id, {
        videoData: result.videoData,
        mimeType: result.mimeType,
        duration: result.duration,
        thumbnailData,
      });
      showToast(t('Video geschnitten'));
    } finally {
      setIsTrimming(false);
    }
  };

  const handleDelete = async () => {
    await deleteCard(card.id);
    showToast(t('Video gelöscht'));
    closeModal();
  };

  const togglePlayback = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
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
        }
      }
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      onSave={handleSave}
      title={t('Video')}
    >
      <div className="space-y-4">
        {/* Label */}
        <div>
          <label htmlFor="video-label" className="block text-sm font-medium text-gray-700 mb-1">
            {t('Bezeichnung')}
          </label>
          <input
            id="video-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('z.B. Video 1')}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue"
          />
        </div>

        {/* Video player */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('Inhalt')}
          </label>
          <div className="relative rounded-2xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              className="w-full aspect-video object-contain"
              playsInline
              preload="metadata"
              onEnded={() => setIsPlaying(false)}
              onError={(e) => {
                console.error('Video error:', e);
                showToast(t('Video kann nicht geladen werden'));
              }}
            >
              <source src={videoUrl} type={card.mimeType || 'video/mp4'} />
              <source src={videoUrl} />
            </video>

            {/* Play/Pause overlay */}
            <button
              onClick={togglePlayback}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
            >
              {!isPlaying && (
                <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
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
        </div>

        {/* Nativer Schnitt (nur in der iOS-App) */}
        {canTrimNatively && (
          <button
            onClick={() => void trimNatively()}
            disabled={isTrimming}
            className="w-full min-h-[44px] rounded-full bg-primary-blue text-white font-semibold text-sm active:scale-95 disabled:opacity-60"
          >
            {isTrimming ? t('Video wird geschnitten …') : t('Video schneiden')}
          </button>
        )}

        {/* Delete link */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleDelete}
            className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            {t('Karte löschen')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
