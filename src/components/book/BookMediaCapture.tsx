import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from '../common';
import { useUIStore } from '../../stores';
import { useBookPageSize, useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { compressImage, createThumbnail } from '../../utils/imageCompression';
import { createAudioItem, createImageItem, createVideoItem } from '../../services/bookItemFactory';
import { speechLocale, useT } from '../../i18n';
import { createVideoThumbnailFromBlob } from '../../utils/videoThumbnail';
import { blobToDataUrl, pickRecordingMimeType } from '../../utils/mediaFormats';
import { isNativeSpeechAvailable, transcribeRecording } from '../../utils/nativeBridge';
import type { BookCaption } from '../../types';

const MAX_VIDEO_DURATION = 30; // Sekunden
const MAX_AUDIO_DURATION = 60; // Sekunden
// Videos werden als Base64 in IndexedDB abgelegt – Galerievideos brauchen eine Obergrenze
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

// --- Web Speech API (optionale Transkription, wie im Whiteboard) -------------

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function createSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * In der iOS-App fehlt die Web Speech API (WKWebView kennt sie nicht). Dort wird
 * die fertige Aufnahme nachträglich nativ erkannt (SFSpeechRecognizer, nur auf
 * dem Gerät) – live geht es nicht, weil WebKit währenddessen das Mikrofon hält.
 */
function needsNativeTranscription(): boolean {
  return createSpeechRecognition() === null && isNativeSpeechAvailable();
}

/** Nachträgliche Transkription; Fehler bleiben still (Untertitel sind optional). */
async function nativeCaptions(blob: Blob): Promise<BookCaption[] | undefined> {
  try {
    const { captions } = await transcribeRecording(blob, speechLocale());
    return captions && captions.length > 0 ? captions : undefined;
  } catch {
    return undefined;
  }
}

// --- Hilfsfunktionen ---------------------------------------------------------

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}


function getVideoDuration(source: Blob): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(source);
  });
}

// --- Komponente --------------------------------------------------------------

export function BookMediaCapture() {
  const t = useT();
  const capture = useBookUIStore((s) => s.capture);
  const captureNonce = useBookUIStore((s) => s.captureNonce);
  const setCapture = useBookUIStore((s) => s.setCapture);

  const pages = useBookStore((s) => s.pages);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const items = useBookStore((s) => s.items);
  const addItem = useBookStore((s) => s.addItem);
  const pageSize = useBookPageSize();

  const showToast = useUIStore((s) => s.showToast);
  const setLoading = useUIStore((s) => s.setLoading);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoRecorder, setVideoRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState<MediaRecorder | null>(null);
  const [audioRecordingTime, setAudioRecordingTime] = useState(0);
  const audioRecordingTimeRef = useRef(0);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  // Zeitlich zugeordnete Untertitel: Start = erstes Zwischenergebnis der Äußerung
  const captionsRef = useRef<BookCaption[]>([]);
  const captionStartRef = useRef(0);
  const captionStartTimesRef = useRef(new Map<number, number>());

  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  // true, sobald das Modal geschlossen wurde: `onstop` darf dann nichts mehr einfügen
  const cancelledRef = useRef(false);

  // Kamera automatisch öffnen (kleine Verzögerung, damit das Input im DOM ist).
  // `captureNonce` sorgt dafür, dass ein erneutes Tippen den Dialog wieder öffnet,
  // auch wenn der vorige Dateidialog abgebrochen wurde (dann bleibt capture === 'photo').
  useEffect(() => {
    if (capture !== 'photo') return;
    const timer = setTimeout(() => cameraInputRef.current?.click(), 100);
    return () => clearTimeout(timer);
  }, [capture, captureNonce]);

  // Kamerastream aufräumen
  useEffect(() => {
    return () => {
      if (videoStream) videoStream.getTracks().forEach((track) => track.stop());
    };
  }, [videoStream]);

  // Die Komponente bleibt dauerhaft gemountet: Wird das Modal geschlossen
  // (Hintergrund, Escape, Abbrechen), müssen Kamera, Mikrofon, Recorder,
  // Spracherkennung und Timer selbst gestoppt werden – sonst laufen sie weiter
  // und `onstop` würde ungefragt ein Video/Audio einfügen.
  useEffect(() => {
    if (capture) {
      cancelledRef.current = false;
      return;
    }
    cancelledRef.current = true;

    const video = videoRecorderRef.current;
    if (video && video.state !== 'inactive') video.stop();
    videoRecorderRef.current = null;

    const audio = audioRecorderRef.current;
    if (audio && audio.state !== 'inactive') audio.stop();
    audioRecorderRef.current = null;

    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;

    try {
      speechRecognitionRef.current?.abort();
    } catch {
      // Spracherkennung ist optional
    }
    speechRecognitionRef.current = null;
    transcriptRef.current = '';
    captionsRef.current = [];

    // Zustand zurücksetzen; die Timer-Effekte räumen dadurch selbst auf
    setVideoRecorder(null);
    setAudioRecorder(null);
    setVideoStream(null);
    setIsRecordingVideo(false);
    setIsRecordingAudio(false);
    setRecordingTime(0);
    setAudioRecordingTime(0);
    recordingTimeRef.current = 0;
    audioRecordingTimeRef.current = 0;
  }, [capture]);

  // Live-Vorschau verbinden
  useEffect(() => {
    if (videoPreviewRef.current && videoStream && isRecordingVideo) {
      videoPreviewRef.current.srcObject = videoStream;
      videoPreviewRef.current.play().catch(() => {
        // Autoplay-Blockade ignorieren
      });
    }
  }, [videoStream, isRecordingVideo]);

  useEffect(() => {
    videoRecorderRef.current = videoRecorder;
  }, [videoRecorder]);

  useEffect(() => {
    audioRecorderRef.current = audioRecorder;
  }, [audioRecorder]);

  useEffect(() => {
    videoStreamRef.current = videoStream;
  }, [videoStream]);

  // Timer Video
  useEffect(() => {
    if (!isRecordingVideo) return;
    const interval = setInterval(() => {
      setRecordingTime((prev) => {
        const next = prev + 1;
        recordingTimeRef.current = next;
        if (next >= MAX_VIDEO_DURATION) {
          speechRecognitionRef.current?.stop();
          const recorder = videoRecorderRef.current;
          if (recorder && recorder.state !== 'inactive') recorder.stop();
          videoStreamRef.current?.getTracks().forEach((track) => track.stop());
          setIsRecordingVideo(false);
          setVideoStream(null);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecordingVideo]);

  // Timer Audio
  useEffect(() => {
    if (!isRecordingAudio) return;
    const interval = setInterval(() => {
      setAudioRecordingTime((prev) => {
        const next = prev + 1;
        audioRecordingTimeRef.current = next;
        if (next >= MAX_AUDIO_DURATION) {
          speechRecognitionRef.current?.stop();
          const recorder = audioRecorderRef.current;
          if (recorder && recorder.state !== 'inactive') recorder.stop();
          setIsRecordingAudio(false);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecordingAudio]);

  const page = pages[currentPageIndex];
  const pageId = page?.id ?? null;
  const offset = pageId ? items.filter((it) => it.pageId === pageId).length : 0;

  const close = () => setCapture(null);

  // --- Spracherkennung (optional, für Transkript und Untertitel) --------------

  /**
   * Startet die Spracherkennung parallel zur Aufnahme. Jede erkannte Äußerung
   * wird mit der Sekunde ab Aufnahmebeginn gespeichert, damit sie später als
   * Untertitel eingeblendet werden kann.
   */
  const startCaptioning = () => {
    transcriptRef.current = '';
    captionsRef.current = [];
    captionStartTimesRef.current = new Map();
    captionStartRef.current = Date.now();
    const recognition = createSpeechRecognition();
    if (!recognition) return;
    recognition.lang = speechLocale();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const elapsed = (Date.now() - captionStartRef.current) / 1000;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const starts = captionStartTimesRef.current;
        if (!starts.has(i)) starts.set(i, Math.max(0, elapsed - 0.5));
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (!text) continue;
          transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
          captionsRef.current.push({ start: Math.round((starts.get(i) ?? elapsed) * 10) / 10, text });
        }
      }
    };
    recognition.onerror = () => {
      // Transkription ist optional
    };
    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }
  };

  const stopCaptioning = () => {
    try {
      speechRecognitionRef.current?.stop();
    } catch {
      // Spracherkennung ist optional
    }
    speechRecognitionRef.current = null;
  };

  const takeCaptions = (): BookCaption[] | undefined => {
    const captions = captionsRef.current;
    captionsRef.current = [];
    return captions.length > 0 ? captions : undefined;
  };

  // --- Speicherpfade ---------------------------------------------------------

  const addImage = async (file: Blob) => {
    if (!pageId) return;
    setLoading(true);
    try {
      const imageData = await compressImage(file);
      const thumbnailData = await createThumbnail(imageData);
      await addItem(await createImageItem(pageId, pageSize, imageData, thumbnailData, offset));
      showToast(t('Foto hinzugefügt'));
    } catch (error) {
      console.error('Foto konnte nicht eingefügt werden:', error);
      showToast(t('Fehler beim Hinzufügen'));
    } finally {
      setLoading(false);
      close();
    }
  };

  const addVideo = async (
    blob: Blob,
    mimeType?: string,
    knownDuration?: number,
    captions?: BookCaption[],
    recorded = false
  ) => {
    if (!pageId) return;
    if (!blob || blob.size === 0) {
      showToast(t('Aufnahme fehlgeschlagen'));
      close();
      return;
    }
    // Vor dem Einlesen prüfen: Base64 in IndexedDB verträgt keine beliebig großen Dateien
    if (blob.size > MAX_VIDEO_BYTES) {
      showToast(t('Das Video ist zu groß (max. 25 MB)'));
      close();
      return;
    }
    setLoading(true);
    try {
      // In der App wird erst jetzt transkribiert – der Ladehinweis bleibt so lange stehen.
      let finalCaptions = captions;
      if (!finalCaptions && recorded && needsNativeTranscription()) {
        finalCaptions = await nativeCaptions(blob);
      }
      const videoData = await blobToDataUrl(blob, 'video/mp4');
      let thumbnailData = '';
      try {
        thumbnailData = await createVideoThumbnailFromBlob(blob);
      } catch {
        // Vorschaubild ist optional
      }
      const duration = knownDuration ?? (await getVideoDuration(blob));
      await addItem(
        createVideoItem(pageId, pageSize, videoData, thumbnailData || undefined, duration, mimeType, offset, finalCaptions)
      );
      showToast(t('Video hinzugefügt'));
    } catch (error) {
      console.error('Video konnte nicht eingefügt werden:', error);
      showToast(t('Fehler beim Hinzufügen'));
    } finally {
      setLoading(false);
      close();
    }
  };

  const addAudio = async (blob: Blob, mimeType?: string, recorded = false) => {
    if (!pageId) return;
    if (!blob || blob.size === 0) {
      showToast(t('Aufnahme fehlgeschlagen'));
      close();
      return;
    }
    setLoading(true);
    try {
      let captions = takeCaptions();
      if (!captions && recorded && needsNativeTranscription()) {
        captions = await nativeCaptions(blob);
      }
      const audioData = await blobToDataUrl(blob, 'audio/mp4');
      const duration = audioRecordingTimeRef.current || audioRecordingTime;
      const transcription =
        transcriptRef.current.trim() || captions?.map((c) => c.text).join(' ').trim() || undefined;
      await addItem(
        createAudioItem(pageId, pageSize, audioData, duration, mimeType, transcription, offset, captions)
      );
      showToast(t('Aufnahme hinzugefügt'));
    } catch (error) {
      console.error('Aufnahme konnte nicht eingefügt werden:', error);
      showToast(t('Fehler beim Hinzufügen'));
    } finally {
      setLoading(false);
      close();
    }
  };

  // --- Aufnahme --------------------------------------------------------------

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 20 },
        },
        audio: { sampleRate: 44100, channelCount: 1 },
      });
      setVideoStream(stream);

      const mimeType = pickRecordingMimeType('video');
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 500000,
        audioBitsPerSecond: 64000,
      });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        // Abgebrochen (Modal geschlossen) – nichts einfügen
        if (cancelledRef.current) return;
        const actualMimeType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: actualMimeType });
        void addVideo(blob, actualMimeType, recordingTimeRef.current, takeCaptions(), true);
      };
      recorder.onerror = () => {
        showToast(t('Aufnahmefehler'));
        stream.getTracks().forEach((track) => track.stop());
        setVideoStream(null);
        setIsRecordingVideo(false);
      };

      setVideoRecorder(recorder);
      recorder.start(100);
      setIsRecordingVideo(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      startCaptioning();
    } catch (error) {
      console.error('Videoaufnahme nicht möglich:', error);
      showToast(t('Kamera nicht verfügbar'));
    }
  };

  const stopVideoRecording = () => {
    stopCaptioning();
    if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
    if (videoStream) videoStream.getTracks().forEach((track) => track.stop());
    setIsRecordingVideo(false);
    setVideoStream(null);
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 44100, channelCount: 1 },
      });

      const mimeType = pickRecordingMimeType('audio');
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        // Abgebrochen (Modal geschlossen) – nichts einfügen
        if (cancelledRef.current) return;
        const actualMimeType = recorder.mimeType || mimeType || 'audio/webm';
        void addAudio(new Blob(chunks, { type: actualMimeType }), actualMimeType, true);
      };
      recorder.onerror = () => {
        showToast(t('Aufnahmefehler'));
        stream.getTracks().forEach((track) => track.stop());
        setIsRecordingAudio(false);
      };

      setAudioRecorder(recorder);
      recorder.start(100);
      setIsRecordingAudio(true);
      setAudioRecordingTime(0);
      audioRecordingTimeRef.current = 0;

      // Spracherkennung parallel starten (optional)
      startCaptioning();
    } catch (error) {
      console.error('Sprachaufnahme nicht möglich:', error);
      showToast(t('Mikrofon nicht verfügbar'));
    }
  };

  const stopAudioRecording = () => {
    stopCaptioning();
    if (audioRecorder && audioRecorder.state !== 'inactive') audioRecorder.stop();
    setIsRecordingAudio(false);
  };

  // --- Rendern ---------------------------------------------------------------

  if (!capture || capture === 'import' || !pageId) return null;

  // Kamera: nur ein verstecktes Input, das automatisch geöffnet wird
  if (capture === 'photo') {
    return (
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addImage(file);
          else close();
        }}
      />
    );
  }

  if (capture === 'gallery') {
    return (
      <Modal isOpen onClose={close} title={t('Bild oder Video wählen')}>
        <div className="space-y-4">
          <p className="text-ink-soft">{t('Woher soll das Bild kommen?')}</p>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-green/50 hover:bg-pastel-green transition-colors"
            >
              <svg className="w-12 h-12 text-ink" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-semibold text-ink">{t('Fotos & Videos')}</span>
            </button>

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-pink/50 hover:bg-pastel-pink transition-colors"
            >
              <svg className="w-12 h-12 text-ink" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-semibold text-ink">{t('Kamera')}</span>
            </button>
          </div>

          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.type.startsWith('image/')) void addImage(file);
              else if (file.type.startsWith('video/')) void addVideo(file, file.type);
              else showToast(t('Nicht unterstütztes Format'));
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addImage(file);
            }}
          />

          <Button variant="secondary" onClick={close} className="w-full">
            {t('Abbrechen')}
          </Button>
        </div>
      </Modal>
    );
  }

  if (capture === 'video') {
    return (
      <Modal isOpen onClose={close} title={t('Video aufnehmen')}>
        <div className="space-y-4">
          {isRecordingVideo ? (
            <>
              <div className="relative rounded-2xl overflow-hidden bg-black">
                <video ref={videoPreviewRef} className="w-full aspect-video object-cover" muted playsInline />
                <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full flex items-center gap-2">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  {formatTime(recordingTime)} / {formatTime(MAX_VIDEO_DURATION)}
                </div>
              </div>
              <Button variant="danger" onClick={stopVideoRecording} className="w-full">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                {t('Aufnahme beenden')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-ink-soft">{t('Nimm ein kurzes Video auf (max. 30 Sekunden):')}</p>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => void startVideoRecording()}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-pink/50 hover:bg-pastel-pink transition-colors"
                >
                  <svg className="w-12 h-12 text-ink" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="font-semibold text-ink">{t('Aufnehmen')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-green/50 hover:bg-pastel-green transition-colors"
                >
                  <svg className="w-12 h-12 text-ink" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  <span className="font-semibold text-ink">{t('Aus Galerie')}</span>
                </button>
              </div>

              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void addVideo(file, file.type);
                }}
              />

              <Button variant="secondary" onClick={close} className="w-full">
                {t('Abbrechen')}
              </Button>
            </>
          )}
        </div>
      </Modal>
    );
  }

  // capture === 'audio'
  return (
    <Modal isOpen onClose={close} title={t('Sprachnotiz aufnehmen')}>
      <div className="space-y-4">
        {isRecordingAudio ? (
          <>
            <div className="flex flex-col items-center py-8 bg-pastel-purple/30 rounded-2xl">
              <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </div>
              <span className="text-2xl font-semibold text-ink">
                {formatTime(audioRecordingTime)} / {formatTime(MAX_AUDIO_DURATION)}
              </span>
              <span className="text-sm text-ink-soft mt-2">{t('Aufnahme läuft …')}</span>
            </div>
            <Button variant="danger" onClick={stopAudioRecording} className="w-full">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              {t('Aufnahme beenden')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-ink-soft text-center">{t('Nimm eine kurze Sprachnotiz auf (max. 60 Sekunden):')}</p>

            <button
              type="button"
              onClick={() => void startAudioRecording()}
              className="w-full flex flex-col items-center gap-4 p-8 rounded-2xl bg-pastel-purple/50 hover:bg-pastel-purple transition-colors"
            >
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </div>
              <span className="font-semibold text-ink text-lg">{t('Aufnahme starten')}</span>
            </button>

            <Button variant="secondary" onClick={close} className="w-full">
              {t('Abbrechen')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
