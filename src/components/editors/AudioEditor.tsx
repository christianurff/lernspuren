import { useState, useRef, useEffect } from 'react';
import { Modal } from '../common';
import type { AudioCard } from '../../types';
import { useCardsStore, useUIStore } from '../../stores';
import { useT, speechLocale } from '../../i18n';
import { useMediaObjectUrl } from '../../utils/mediaUrl';
import {
  canTranscribeRecording,
  captionsToText,
  transcribeMedia,
  type TranscriptionError,
} from '../../services/transcriptionService';

interface AudioEditorProps {
  card: AudioCard;
}

// Minimale Typen für die Web Speech API (im DOM-Typ evtl. nicht vorhanden)
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function AudioEditor({ card }: AudioEditorProps) {
  const t = useT();
  const audioUrl = useMediaObjectUrl(card.audioData);
  const [label, setLabel] = useState(card.label || '');
  const [transcription, setTranscription] = useState(card.transcription || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDictating, setIsDictating] = useState(false);
  const [prevCardId, setPrevCardId] = useState(card.id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const { updateCard, deleteCard } = useCardsStore();
  const { closeModal, showToast } = useUIStore();

  // Web Speech API nur nutzen, falls vorhanden – sonst Feature stumm überspringen
  const speechSupported = !!getSpeechRecognition();
  // In der iOS-App fehlt die Web Speech API; dort lässt sich die fertige
  // Aufnahme nachträglich erkennen – auch wenn es beim Aufnehmen nicht klappte.
  const canRecognizeRecording = canTranscribeRecording();
  const [isRecognizing, setIsRecognizing] = useState(false);
  // Nicht nur „ging nicht“, sondern warum – daran hängt, was zu tun ist.
  const [recognizeFailure, setRecognizeFailure] = useState<TranscriptionError | null>(null);

  const recognizeRecording = async () => {
    setIsRecognizing(true);
    setRecognizeFailure(null);
    try {
      const { captions, error } = await transcribeMedia(card.audioData, card.mimeType);
      const text = captions ? captionsToText(captions) : '';
      if (text) setTranscription(text);
      else setRecognizeFailure(error ?? 'other');
    } finally {
      setIsRecognizing(false);
    }
  };

  // Beim Wechsel auf eine andere Karte Felder neu laden (inkl. vorhandener Transkription)
  if (prevCardId !== card.id) {
    setPrevCardId(card.id);
    setLabel(card.label || '');
    setTranscription(card.transcription || '');
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  // Spracherkennung beim Schließen sicher beenden
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // ignorieren
        }
      }
    };
  }, []);

  const startDictation = () => {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;
    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = speechLocale();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          }
        }
        finalText = finalText.trim();
        if (finalText) {
          // Nur finale Ergebnisse akkumulieren
          setTranscription((prev) => {
            const separator = prev && !prev.endsWith(' ') ? ' ' : '';
            return prev + separator + finalText;
          });
        }
      };
      recognition.onerror = () => {
        setIsDictating(false);
      };
      recognition.onend = () => {
        setIsDictating(false);
      };
      recognition.start();
      recognitionRef.current = recognition;
      setIsDictating(true);
    } catch {
      setIsDictating(false);
    }
  };

  const stopDictation = () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignorieren
      }
    }
    recognitionRef.current = null;
    setIsDictating(false);
  };

  const handleSave = async () => {
    stopDictation();
    await updateCard(card.id, {
      label: label || undefined,
      transcription: transcription.trim() || undefined,
    });
    closeModal();
  };

  const handleDelete = async () => {
    await deleteCard(card.id);
    showToast(t('Sprachnotiz gelöscht'));
    closeModal();
  };

  const togglePlayback = async () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          console.error('Audio playback error:', error);
          showToast(t('Audio kann nicht abgespielt werden'));
        }
      }
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const duration = card.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      onSave={handleSave}
      title={t('Sprachnotiz')}
    >
      <div className="space-y-4">
        {/* Label */}
        <div>
          <label htmlFor="audio-label" className="block text-sm font-medium text-gray-700 mb-1">
            {t('Bezeichnung')}
          </label>
          <input
            id="audio-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('z.B. Notiz 1')}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue"
          />
        </div>

        {/* Audio player */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('Inhalt')}
          </label>
          <div className="bg-pastel-purple/30 rounded-2xl p-6">
            <audio
              ref={audioRef}
              preload="metadata"
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              onError={(e) => {
                console.error('Audio error:', e);
                showToast(t('Audio kann nicht geladen werden'));
              }}
            >
              <source src={audioUrl} type={card.mimeType || 'audio/mp4'} />
              <source src={audioUrl} />
            </audio>

            {/* Play button */}
            <div className="flex flex-col items-center">
              <button
                onClick={togglePlayback}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                  isPlaying ? 'bg-red-500' : 'bg-pastel-purple'
                }`}
              >
                {isPlaying ? (
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress bar */}
              <div className="w-full mt-4">
                <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-pastel-purple h-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-sm text-gray-600">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transkription (automatisch) */}
        {(speechSupported || canRecognizeRecording || card.transcription) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="audio-transcription" className="block text-sm font-medium text-gray-700">
                {t('Transkription (automatisch)')}
              </label>
              {speechSupported ? (
                <button
                  type="button"
                  onClick={isDictating ? stopDictation : startDictation}
                  className={`text-sm font-semibold transition-colors ${
                    isDictating ? 'text-red-500' : 'text-primary-blue'
                  }`}
                >
                  {isDictating ? t('Stopp') : t('Diktieren')}
                </button>
              ) : (
                canRecognizeRecording && (
                  <button
                    type="button"
                    onClick={() => void recognizeRecording()}
                    disabled={isRecognizing}
                    className="text-sm font-semibold text-primary-blue transition-colors disabled:opacity-60"
                  >
                    {isRecognizing ? t('Wird erkannt …') : t('Text erkennen')}
                  </button>
                )
              )}
            </div>
            <textarea
              id="audio-transcription"
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              rows={3}
              placeholder={t('Automatisch erkannter Text …')}
              className="w-full px-4 py-2 rounded-xl bg-[#F5F7FA] border border-transparent focus:outline-none focus:ring-2 focus:ring-pastel-blue resize-none text-ink"
            />
            {recognizeFailure && (
              <p className="mt-1 text-xs text-ink-soft">
                {recognizeFailure === 'permission'
                  ? t('Die Spracherkennung ist nicht erlaubt. Du kannst sie in den Einstellungen unter Lernspuren einschalten.')
                  : recognizeFailure === 'language'
                    ? t('Diese Sprache kann auf dem Gerät nicht offline erkannt werden.')
                    : t('Es war nichts zu verstehen. Du kannst den Text auch selbst eintippen.')}
              </p>
            )}
            {isDictating && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {t('Aufnahme läuft …')}
              </p>
            )}
          </div>
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
