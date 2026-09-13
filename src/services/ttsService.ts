// Vorlesen (Text-to-Speech) wie in der iOS-App: Stimme passend zur Sprache, leicht verlangsamt
import { speechLocale } from '../i18n';

type SpeakingListener = (isSpeaking: boolean) => void;

const listeners = new Set<SpeakingListener>();
let speaking = false;
// Die gerade laufende Äußerung – ihre Handler werden vor jedem cancel() abgehängt,
// damit ein abgebrochener Vorgang nicht nachträglich „fertig" meldet.
let currentUtterance: SpeechSynthesisUtterance | null = null;

function detachCurrent() {
  if (!currentUtterance) return;
  currentUtterance.onend = null;
  currentUtterance.onerror = null;
  currentUtterance = null;
}

function notify(value: boolean) {
  speaking = value;
  listeners.forEach((listener) => listener(value));
}

export const ttsService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  isSpeaking(): boolean {
    return speaking;
  },

  speak(text: string): void {
    if (!this.isSupported() || !text.trim()) return;

    detachCurrent();
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLocale();
    utterance.rate = 0.9;
    const finish = () => {
      if (currentUtterance !== utterance) return;
      currentUtterance = null;
      notify(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    currentUtterance = utterance;

    notify(true);
    window.speechSynthesis.speak(utterance);
  },

  stop(): void {
    if (!this.isSupported()) return;
    detachCurrent();
    window.speechSynthesis.cancel();
    notify(false);
  },

  subscribe(listener: SpeakingListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
