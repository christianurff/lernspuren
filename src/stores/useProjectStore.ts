import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Project } from '../types';
import { projectService } from '../services/db/database';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (name: string, backgroundColor?: string, extras?: Partial<Project>) => Promise<Project>;
  updateProject: (id: string, changes: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (id: string | null) => void;
  getCurrentProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectService.getAll();
      set({ projects, isLoading: false });
    } catch (error) {
      set({ error: 'Fehler beim Laden der Projekte', isLoading: false });
      console.error('Failed to load projects:', error);
    }
  },

  createProject: async (name: string, backgroundColor = '#F0F4FF', extras?: Partial<Project>) => {
    const now = Date.now();
    const project: Project = {
      id: uuid(),
      name,
      backgroundColor,
      ...extras,
      createdAt: now,
      updatedAt: now,
      cardCount: 0,
    };

    try {
      await projectService.create(project);
      set((state) => ({ projects: [project, ...state.projects] }));
      return project;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  },

  updateProject: async (id: string, changes: Partial<Project>) => {
    try {
      await projectService.update(id, changes);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...changes, updatedAt: Date.now() } : p
        ),
      }));
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  },

  deleteProject: async (id: string) => {
    try {
      // In den Papierkorb (Soft-Delete); endgültiges Löschen über den Papierkorb
      await projectService.softDelete(id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
      }));
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  },

  setCurrentProject: (id: string | null) => {
    set({ currentProjectId: id });
  },

  getCurrentProject: () => {
    const { projects, currentProjectId } = get();
    return projects.find((p) => p.id === currentProjectId);
  },
}));
