import { useRef, useEffect, useState } from 'react';
import { Modal, Button } from '../common';
import { useCardsStore, useUIStore, useProjectStore, useCanvasStore } from '../../stores';
import { CARD_SIZES, type Position } from '../../types';
import { textEditRect } from '../../utils/cardGeometry';
import { blurInlineEditFields } from '../canvas/inlineEditFocus';
import { compressImage, createThumbnail } from '../../utils/imageCompression';
import { speechLocale, useT } from '../../i18n';
import { isNativeSpeechAvailable, transcribeRecording } from '../../utils/nativeBridge';
import { pickRecordingMimeType } from '../../utils/mediaFormats';

interface AddCardModalProps {
  type: 'photo' | 'photo-camera' | 'gallery' | 'text' | 'video' | 'audio' | 'drawing';
}

// Minimale Typen für die Web Speech API (automatische Transkription wie iOS SpeechService)
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

/**
 * Startplatz einer neuen Karte: im oberen Drittel des sichtbaren Ausschnitts.
 * So liegt sie dort, wo man gerade hinsieht, und auf iOS nicht hinter der
 * Tastatur. Der kleine Zufallsversatz verhindert exakt deckungsgleiche Karten.
 */
function newCardPosition(): Position {
  const { scale, position } = useCanvasStore.getState();
  const anchorX = window.innerWidth / 2 + (Math.random() * 40 - 20);
  const anchorY = window.innerHeight * 0.32 + (Math.random() * 40 - 20);
  return {
    x: Math.round((anchorX - position.x) / scale - CARD_SIZES.medium.width / 2),
    y: Math.round((anchorY - position.y) / scale - CARD_SIZES.medium.height / 2),
  };
}

function createSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function AddCardModal({ type }: AddCardModalProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const hasAddedCard = useRef(false);

  // Video recording state
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoRecorder, setVideoRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0); // Ref to avoid stale closures
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Audio recording state
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState<MediaRecorder | null>(null);
  const [audioRecordingTime, setAudioRecordingTime] = useState(0);
  const audioRecordingTimeRef = useRef(0); // Ref to avoid stale closures
  // Automatische Transkription während der Aufnahme (falls vom Browser unterstützt)
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');

  const { currentProjectId } = useProjectStore();
  const { addPhotoCard, addTextCard, addVideoCard, addAudioCard, updateCard } = useCardsStore();
  const { closeModal, showToast, setLoading } = useUIStore();

  const MAX_VIDEO_DURATION = 30; // 30 seconds
  const MAX_AUDIO_DURATION = 60; // 60 seconds

  // Refs für die Aufräumarbeiten beim Unmount (Streams/Recorder/Spracherkennung)
  const audioStreamRef = useRef<MediaStream | null>(null);
  // Wird beim Schließen gesetzt: onstop darf dann keine Karte mehr anlegen
  const cancelledRef = useRef(false);
  // Schutz gegen doppeltes Starten (Doppelklick auf „Aufnehmen")
  const isStartingRef = useRef(false);

  // Set video srcObject when stream and video element are ready
  useEffect(() => {
    if (videoPreviewRef.current && videoStream && isRecordingVideo) {
      videoPreviewRef.current.srcObject = videoStream;
      videoPreviewRef.current.play().catch(err => {
        console.error('Failed to play video preview:', err);
      });
    }
  }, [videoStream, isRecordingVideo]);

  // Refs to hold current recorder and stream references for cleanup
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    videoRecorderRef.current = videoRecorder;
  }, [videoRecorder]);

  useEffect(() => {
    audioRecorderRef.current = audioRecorder;
  }, [audioRecorder]);

  useEffect(() => {
    videoStreamRef.current = videoStream;
  }, [videoStream]);

  // Aufräumen beim Unmount: Kamera/Mikrofon freigeben, Spracherkennung beenden
  // und verhindern, dass ein spätes onstop noch eine Karte anlegt.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;

      const recorders = [videoRecorderRef.current, audioRecorderRef.current];
      for (const recorder of recorders) {
        if (!recorder) continue;
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            // Recorder war bereits beendet
          }
        }
      }

      for (const stream of [videoStreamRef.current, audioStreamRef.current]) {
        stream?.getTracks().forEach((track) => track.stop());
      }
      videoStreamRef.current = null;
      audioStreamRef.current = null;

      const recognition = speechRecognitionRef.current;
      speechRecognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        try {
          recognition.abort();
        } catch {
          // Spracherkennung war bereits beendet
        }
      }
    };
  }, []);

  // Video recording timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecordingVideo) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          recordingTimeRef.current = newTime; // Keep ref in sync
          if (newTime >= MAX_VIDEO_DURATION) {
            // Stop recording using the ref to avoid stale closure
            const recorder = videoRecorderRef.current;
            if (recorder && recorder.state !== 'inactive') {
              recorder.stop();
            }
            // Also stop the video stream
            const stream = videoStreamRef.current;
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            setIsRecordingVideo(false);
            setVideoStream(null);
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecordingVideo]);

  // Audio recording timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecordingAudio) {
      interval = setInterval(() => {
        setAudioRecordingTime(prev => {
          const newTime = prev + 1;
          audioRecordingTimeRef.current = newTime; // Keep ref in sync
          if (newTime >= MAX_AUDIO_DURATION) {
            // Stop recording using the ref to avoid stale closure
            const recorder = audioRecorderRef.current;
            if (recorder && recorder.state !== 'inactive') {
              recorder.stop();
            }
            setIsRecordingAudio(false);
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecordingAudio]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProjectId) return;

    setLoading(true);
    try {
      const imageData = await compressImage(file);
      const thumbnailData = await createThumbnail(imageData);
      await addPhotoCard(currentProjectId, imageData, thumbnailData);
      showToast(t('Foto hinzugefügt'));
      closeModal();
    } catch (error) {
      console.error('Failed to add photo:', error);
      showToast(t('Fehler beim Hinzufügen'));
    } finally {
      setLoading(false);
    }
  };

  const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProjectId) return;

    setLoading(true);
    try {
      // Store file blob directly instead of converting to base64
      const thumbnailData = await createVideoThumbnail(file);
      const duration = await getVideoDuration(file);
      // File is a Blob, pass it directly for efficient storage
      await addVideoCard(currentProjectId, file, thumbnailData, duration, file.type);
      showToast(t('Video hinzugefügt'));
      closeModal();
    } catch (error) {
      console.error('Failed to add video:', error);
      showToast(t('Fehler beim Hinzufügen'));
    } finally {
      setLoading(false);
    }
  };

  // Start video recording with reduced quality for better storage
  // Low framerate is fine for documentation videos with little movement
  const startVideoRecording = async () => {
    // Doppel-Start-Schutz: zweiter Klick würde einen zweiten Stream öffnen
    if (isStartingRef.current || isRecordingVideo || videoRecorderRef.current?.state === 'recording') return;
    isStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 20 } // Low fps for static content
        },
        audio: {
          sampleRate: 44100,
          channelCount: 1
        }
      });
      // Modal wurde während der Berechtigungsabfrage geschlossen
      if (cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setVideoStream(stream);
      videoStreamRef.current = stream;

      // Get supported mimeType for this browser with reduced bitrate
      const mimeType = pickRecordingMimeType('video');
      const recorderOptions: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 500000, // 500 kbps - sufficient for low motion
        audioBitsPerSecond: 64000   // 64 kbps audio
      };
      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Nach dem Schließen des Modals keine Karte mehr anlegen
        if (cancelledRef.current) return;
        const actualMimeType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: actualMimeType });
        await saveVideoRecording(blob, actualMimeType);
      };

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        showToast(t('Aufnahmefehler'));
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
        setIsRecordingVideo(false);
      };

      setVideoRecorder(recorder);
      videoRecorderRef.current = recorder;
      recorder.start(100);
      // Set recording state FIRST so the video element renders
      setIsRecordingVideo(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0; // Reset ref
    } catch (error) {
      console.error('Failed to start video recording:', error);
      showToast(t('Kamera nicht verfügbar'));
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopVideoRecording = () => {
    const recorder = videoRecorderRef.current ?? videoRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    const stream = videoStreamRef.current ?? videoStream;
    stream?.getTracks().forEach(track => track.stop());
    videoStreamRef.current = null;
    setIsRecordingVideo(false);
    setVideoStream(null);
  };

  const saveVideoRecording = async (blob: Blob, mimeType?: string) => {
    if (!currentProjectId) {
      console.error('No project ID available');
      showToast(t('Kein Projekt ausgewählt'));
      closeModal();
      return;
    }

    // Validate blob
    if (!blob || blob.size === 0) {
      console.error('Invalid video blob: empty or null');
      showToast(t('Aufnahme fehlgeschlagen'));
      closeModal();
      return;
    }

    setLoading(true);
    try {
      // Store blob directly instead of converting to base64
      // This saves ~33% storage space and is more efficient
      let thumbnailData = '';
      try {
        // Use Promise.race to ensure we don't hang
        const thumbnailPromise = createVideoThumbnailFromBlob(blob);
        const timeoutPromise = new Promise<string>((resolve) => {
          setTimeout(() => resolve(''), 4000);
        });
        thumbnailData = await Promise.race([thumbnailPromise, timeoutPromise]);
      } catch {
        // Continue without thumbnail
      }

      // Use ref to get the actual recording time (avoid stale closure)
      const duration = recordingTimeRef.current || recordingTime;
      // Pass blob directly for efficient storage
      await addVideoCard(currentProjectId, blob, thumbnailData, duration, mimeType);
      showToast(t('Video hinzugefügt'));
      // Small delay to ensure state is fully propagated before closing modal
      await new Promise(resolve => setTimeout(resolve, 100));
      closeModal();
    } catch (error) {
      console.error('Failed to save video:', error);
      showToast(t('Fehler beim Speichern'));
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  // Start audio recording with reduced quality for better storage
  const startAudioRecording = async () => {
    // Doppel-Start-Schutz: zweiter Klick würde ein zweites Mikrofon öffnen
    if (isStartingRef.current || isRecordingAudio || audioRecorderRef.current?.state === 'recording') return;
    isStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1
        }
      });
      // Modal wurde während der Berechtigungsabfrage geschlossen
      if (cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      audioStreamRef.current = stream;

      // Get supported mimeType for this browser with reduced bitrate
      const mimeType = pickRecordingMimeType('audio');
      const recorderOptions: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000 // 64 kbps for smaller file size
      };
      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        // Nach dem Schließen des Modals keine Karte mehr anlegen
        if (cancelledRef.current) return;
        const actualMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: actualMimeType });
        await saveAudioRecording(blob, actualMimeType);
      };

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        showToast(t('Aufnahmefehler'));
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        setIsRecordingAudio(false);
      };

      setAudioRecorder(recorder);
      audioRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecordingAudio(true);
      setAudioRecordingTime(0);

      // Spracherkennung parallel starten (de-DE, wie iOS SpeechService)
      transcriptRef.current = '';
      const recognition = createSpeechRecognition();
      if (recognition) {
        recognition.lang = speechLocale();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              transcriptRef.current = `${transcriptRef.current} ${result[0].transcript}`.trim();
            }
          }
        };
        recognition.onerror = () => {
          // Transkription ist optional — Fehler still ignorieren
        };
        try {
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {
          speechRecognitionRef.current = null;
        }
      }
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      showToast(t('Mikrofon nicht verfügbar'));
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopAudioRecording = () => {
    const recorder = audioRecorderRef.current ?? audioRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    setIsRecordingAudio(false);
  };

  const saveAudioRecording = async (blob: Blob, mimeType?: string) => {
    if (!currentProjectId) {
      console.error('No project ID available');
      showToast(t('Kein Projekt ausgewählt'));
      closeModal();
      return;
    }

    // Validate blob
    if (!blob || blob.size === 0) {
      console.error('Invalid audio blob: empty or null');
      showToast(t('Aufnahme fehlgeschlagen'));
      closeModal();
      return;
    }

    setLoading(true);
    try {
      // Store blob directly instead of converting to base64
      const duration = audioRecordingTimeRef.current || audioRecordingTime;
      const card = await addAudioCard(currentProjectId, blob, duration, mimeType);
      // Automatisch erkannte Transkription anhängen (falls vorhanden). In der
      // iOS-App fehlt die Web Speech API – dort wird die fertige Aufnahme
      // nachträglich nativ erkannt (der Ladehinweis bleibt so lange stehen).
      let transcription = transcriptRef.current.trim();
      if (!transcription && !createSpeechRecognition() && isNativeSpeechAvailable()) {
        try {
          const { captions } = await transcribeRecording(blob, speechLocale());
          transcription = captions?.map((c) => c.text).join(' ').trim() ?? '';
        } catch {
          // Transkription ist optional – Fehler still ignorieren
        }
      }
      if (transcription) {
        await updateCard(card.id, { transcription });
      }
      showToast(t('Audioaufnahme hinzugefügt'));
      // Small delay to ensure state is fully propagated before closing modal
      await new Promise(resolve => setTimeout(resolve, 100));
      closeModal();
    } catch (error) {
      console.error('Failed to save audio:', error);
      showToast(t('Fehler beim Speichern'));
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  const { openModal } = useUIStore();

  // Handle text card creation in useEffect to avoid multiple calls
  useEffect(() => {
    if (type === 'text' && currentProjectId && !hasAddedCard.current) {
      hasAddedCard.current = true;

      const createTextCard = async () => {
        try {
          // Die Karte kommt dorthin, wo man gerade hinschaut – nicht irgendwo
          // ins Weltkoordinatensystem, wo man sie erst suchen müsste.
          const card = await addTextCard(currentProjectId, '', newCardPosition());
          closeModal();

          // Direkt losschreiben: Die Tastatur ist schon oben (der Tipp auf
          // „Text" hat das Feld fokussiert), jetzt rückt das Feld an die Karte.
          const project = useProjectStore.getState().projects.find((p) => p.id === currentProjectId);
          const rect = textEditRect(card, card.position, {
            freeLayout: project?.cardLayout === 'free',
            compact: useUIStore.getState().globalCompactView,
          });
          useCardsStore.getState().setSelectedCard(card.id);
          useCardsStore.getState().startInlineEdit(card.id, 'content', rect.position, rect.size);
        } catch (error) {
          console.error('Failed to add text card:', error);
          // Sonst bliebe die Tastatur über einem unsichtbaren Feld stehen
          blurInlineEditFields();
          showToast(t('Fehler beim Hinzufügen'));
        }
      };

      createTextCard();
    }
  }, [type, currentProjectId, addTextCard, showToast, closeModal, t]);

  // Handle drawing card - open drawing editor directly
  useEffect(() => {
    if (type === 'drawing' && !hasAddedCard.current) {
      hasAddedCard.current = true;
      // Close current modal and open drawing editor
      closeModal();
      // Small delay to ensure modal is closed before opening new one
      setTimeout(() => {
        openModal('drawingEditor', undefined);
      }, 50);
    }
  }, [type, closeModal, openModal]);

  // Handle photo-camera - directly open camera
  useEffect(() => {
    if (type !== 'photo-camera' || hasAddedCard.current) return;
    hasAddedCard.current = true;

    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    // Bricht der Nutzer die Kamera ab, feuert kein change-Event. Ohne das
    // Schließen bliebe das (unsichtbare) Modal offen und der Kamera-Knopf tot.
    // Deshalb beim Zurückkehren ins Fenster ohne Auswahl selbst schließen —
    // das funktioniert auch auf iOS Safari.
    const handleReturn = () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (!cameraInputRef.current?.files?.length) {
          closeModal();
        }
      }, 800);
    };

    // Erst nach dem Öffnen der Kamera auf die Rückkehr lauschen
    const openTimer = setTimeout(() => {
      cameraInputRef.current?.click();
      window.addEventListener('focus', handleReturn);
    }, 100);

    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      window.removeEventListener('focus', handleReturn);
    };
  }, [type, closeModal]);

  // Gallery input ref (no auto-click due to iOS restrictions)
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Handle gallery file selection (photos and videos)
  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProjectId) {
      closeModal();
      return;
    }

    setLoading(true);
    try {
      if (file.type.startsWith('image/')) {
        // Handle image
        const imageData = await compressImage(file);
        const thumbnailData = await createThumbnail(imageData);
        await addPhotoCard(currentProjectId, imageData, thumbnailData);
        showToast(t('Foto hinzugefügt'));
      } else if (file.type.startsWith('video/')) {
        // Handle video
        const thumbnailData = await createVideoThumbnail(file);
        const duration = await getVideoDuration(file);
        await addVideoCard(currentProjectId, file, thumbnailData, duration, file.type);
        showToast(t('Video hinzugefügt'));
      } else {
        showToast(t('Nicht unterstütztes Format'));
      }
      closeModal();
    } catch (error) {
      console.error('Failed to add media:', error);
      showToast(t('Fehler beim Hinzufügen'));
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  if (type === 'text' || type === 'drawing') {
    return null;
  }

  // Photo-camera: render hidden input and auto-trigger it
  if (type === 'photo-camera') {
    return (
      <>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFileSelect(e);
            } else {
              closeModal();
            }
          }}
          className="hidden"
        />
      </>
    );
  }

  // Gallery: show modal with button to trigger file picker (required for iOS)
  if (type === 'gallery') {
    return (
      <Modal isOpen={true} onClose={closeModal} title={t('Aus Galerie wählen')}>
        <div className="space-y-4">
          <p className="text-gray-600">{t('Wähle ein Foto oder Video aus deiner Galerie:')}</p>

          <div className="grid grid-cols-2 gap-4">
            {/* Photos */}
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-green/50 hover:bg-pastel-green transition-colors"
            >
              <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-gray-700">{t('Fotos & Videos')}</span>
            </button>

            {/* Camera shortcut */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-pink/50 hover:bg-pastel-pink transition-colors"
            >
              <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-medium text-gray-700">{t('Kamera')}</span>
            </button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleGalleryFileSelect(e);
              }
            }}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFileSelect(e);
              }
            }}
            className="hidden"
          />

          <Button variant="secondary" onClick={closeModal} className="w-full">
            {t('Abbrechen')}
          </Button>
        </div>
      </Modal>
    );
  }

  // Video modal
  if (type === 'video') {
    return (
      <Modal isOpen={true} onClose={closeModal} title={t('Video aufnehmen')}>
        <div className="space-y-4">
          {isRecordingVideo ? (
            <>
              <div className="relative rounded-2xl overflow-hidden bg-black">
                <video
                  ref={videoPreviewRef}
                  className="w-full aspect-video object-cover"
                  muted
                  playsInline
                />
                <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full flex items-center gap-2">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  {formatTime(recordingTime)} / {formatTime(MAX_VIDEO_DURATION)}
                </div>
              </div>
              <Button
                variant="danger"
                onClick={stopVideoRecording}
                className="w-full"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                {t('Aufnahme beenden')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-gray-600">{t('Nimm ein kurzes Video auf (max. 30 Sekunden):')}</p>

              <div className="grid grid-cols-2 gap-4">
                {/* Record */}
                <button
                  onClick={startVideoRecording}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-pink/50 hover:bg-pastel-pink transition-colors"
                >
                  <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium text-gray-700">{t('Aufnehmen')}</span>
                </button>

                {/* From gallery */}
                <button
                  onClick={() => videoInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-green/50 hover:bg-pastel-green transition-colors"
                >
                  <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  <span className="font-medium text-gray-700">{t('Aus Galerie')}</span>
                </button>
              </div>

              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoFileSelect}
                className="hidden"
              />

              <Button variant="secondary" onClick={closeModal} className="w-full">
                {t('Abbrechen')}
              </Button>
            </>
          )}
        </div>
      </Modal>
    );
  }

  // Audio modal
  if (type === 'audio') {
    return (
      <Modal isOpen={true} onClose={closeModal} title={t('Sprachnotiz aufnehmen')}>
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
                <span className="text-2xl font-medium text-gray-800">
                  {formatTime(audioRecordingTime)} / {formatTime(MAX_AUDIO_DURATION)}
                </span>
                <span className="text-sm text-gray-500 mt-2">{t('Aufnahme läuft...')}</span>
              </div>
              <Button
                variant="danger"
                onClick={stopAudioRecording}
                className="w-full"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                {t('Aufnahme beenden')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-gray-600 text-center">{t('Nimm eine kurze Sprachnotiz auf (max. 60 Sekunden):')}</p>

              <button
                onClick={startAudioRecording}
                className="w-full flex flex-col items-center gap-4 p-8 rounded-2xl bg-pastel-purple/50 hover:bg-pastel-purple transition-colors"
              >
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-700 text-lg">{t('Aufnahme starten')}</span>
              </button>

              <Button variant="secondary" onClick={closeModal} className="w-full">
                {t('Abbrechen')}
              </Button>
            </>
          )}
        </div>
      </Modal>
    );
  }

  // Photo modal (default)
  return (
    <Modal isOpen={true} onClose={closeModal} title={t('Foto hinzufügen')}>
      <div className="space-y-4">
        <p className="text-gray-600">{t('Wähle eine Quelle für dein Foto:')}</p>

        <div className="grid grid-cols-2 gap-4">
          {/* Camera */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-pink/50 hover:bg-pastel-pink transition-colors"
          >
            <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium text-gray-700">{t('Kamera')}</span>
          </button>

          {/* Gallery */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-pastel-green/50 hover:bg-pastel-green transition-colors"
          >
            <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium text-gray-700">{t('Galerie')}</span>
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        <Button variant="secondary" onClick={closeModal} className="w-full">
          {t('Abbrechen')}
        </Button>
      </div>
    </Modal>
  );
}

// Helper functions
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration));
    };
    video.onerror = () => {
      // Object-URL auch im Fehlerfall freigeben
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}

function createVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      // Seek to middle of video for better thumbnail
      video.currentTime = video.duration / 2;
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = Math.round((200 / video.videoWidth) * video.videoHeight);
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(video.src);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    video.onerror = () => {
      // Object-URL auch im Fehlerfall freigeben
      URL.revokeObjectURL(video.src);
      resolve('');
    };
    video.src = URL.createObjectURL(file);
  });
}

function createVideoThumbnailFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    // Shorter timeout (3 seconds) to prevent UI hanging
    const timeout = setTimeout(() => {
      console.warn('Video thumbnail creation timed out');
      cleanup();
      resolve('');
    }, 3000);

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timeout);
      try {
        URL.revokeObjectURL(video.src);
      } catch {
        // Ignore cleanup errors
      }
    };

    const captureFrame = () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.warn('Video dimensions not available');
          cleanup();
          resolve('');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = Math.round((200 / video.videoWidth) * video.videoHeight) || 150;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          cleanup();
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          cleanup();
          resolve('');
        }
      } catch (err) {
        console.error('Error creating thumbnail:', err);
        cleanup();
        resolve('');
      }
    };

    video.onloadedmetadata = () => {
      // Seek to middle of video for better thumbnail
      if (video.duration && video.duration > 0) {
        video.currentTime = video.duration / 2;
      }
    };

    video.onseeked = () => {
      captureFrame();
    };

    // Fallback: if onseeked never fires, try to capture on canplay
    video.oncanplay = () => {
      // Give onseeked a chance to fire first
      setTimeout(() => {
        if (!cleaned) {
          console.log('Capturing frame from canplay event');
          captureFrame();
        }
      }, 500);
    };

    video.onerror = (e) => {
      console.error('Video error during thumbnail creation:', e);
      cleanup();
      resolve('');
    };

    try {
      video.src = URL.createObjectURL(blob);
      video.load();
    } catch (err) {
      console.error('Error setting video source:', err);
      cleanup();
      resolve('');
    }
  });
}
