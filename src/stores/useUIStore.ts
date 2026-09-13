import { create } from 'zustand';
import type { VideoCard, AudioCard } from '../types';

type ModalType =
  | 'createProject'
  | 'deleteProject'
  | 'cardOptions'
  | 'addCard'
  | 'textEditor'
  | 'videoEditor'
  | 'audioEditor'
  | 'photoEditor'
  | 'drawingEditor'
  | 'taskEditor'
  | 'backgroundTextEditor'
  | 'exportProject'
  | 'groupsPanel'
  | 'shareProject'
  | null;

// Inline media playback state
interface PlayingMedia {
  card: VideoCard | AudioCard;
  screenPosition: { x: number; y: number };
  screenSize: { width: number; height: number };
}

interface UIState {
  modalType: ModalType;
  modalData: unknown;
  isLoading: boolean;
  toastMessage: string | null;
  globalCompactView: boolean;
  playingMedia: PlayingMedia | null;
  // Lehrkraft-Modus (wie iOS): schaltet Aufgabenkarten & Schutzfunktionen frei.
  // Startet bewusst immer im Kind-Modus.
  isTeacherMode: boolean;

  // Actions
  openModal: (type: ModalType, data?: unknown) => void;
  closeModal: () => void;
  setLoading: (isLoading: boolean) => void;
  showToast: (message: string) => void;
  hideToast: () => void;
  toggleGlobalCompactView: () => void;
  startMediaPlayback: (card: VideoCard | AudioCard, screenPosition: { x: number; y: number }, screenSize: { width: number; height: number }) => void;
  stopMediaPlayback: () => void;
  toggleTeacherMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  modalType: null,
  modalData: null,
  isLoading: false,
  toastMessage: null,
  globalCompactView: false,
  playingMedia: null,
  isTeacherMode: false,

  openModal: (type: ModalType, data?: unknown) => {
    set({ modalType: type, modalData: data });
  },

  closeModal: () => {
    set({ modalType: null, modalData: null });
  },

  setLoading: (isLoading: boolean) => {
    set({ isLoading });
  },

  showToast: (message: string) => {
    set({ toastMessage: message });
    setTimeout(() => {
      set({ toastMessage: null });
    }, 3000);
  },

  hideToast: () => {
    set({ toastMessage: null });
  },

  toggleGlobalCompactView: () => {
    set((state) => ({ globalCompactView: !state.globalCompactView }));
  },

  startMediaPlayback: (card, screenPosition, screenSize) => {
    set({ playingMedia: { card, screenPosition, screenSize } });
  },

  stopMediaPlayback: () => {
    set({ playingMedia: null });
  },

  toggleTeacherMode: () => {
    set((state) => ({ isTeacherMode: !state.isTeacherMode }));
  },
}));
