import { useState } from 'react';
import { useCardsStore, useZonesStore, useCanvasStore, useProjectStore, useScenesStore, useUIStore } from '../../stores';
import type { SceneCardState, SceneZoneState } from '../../types';
import { useT, dateLocale } from '../../i18n';

export function ScenesPanel() {
  const t = useT();
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const cards = useCardsStore((state) => state.cards);
  const updatePosition = useCardsStore((state) => state.updatePosition);
  const bringToFront = useCardsStore((state) => state.bringToFront);
  const zones = useZonesStore((state) => state.zones);
  const updateZone = useZonesStore((state) => state.updateZone);
  const scale = useCanvasStore((state) => state.scale);
  const position = useCanvasStore((state) => state.position);
  const setScale = useCanvasStore((state) => state.setScale);
  const setPosition = useCanvasStore((state) => state.setPosition);
  const scenes = useScenesStore((state) => state.scenes);
  const createScene = useScenesStore((state) => state.createScene);
  const deleteScene = useScenesStore((state) => state.deleteScene);
  const renameScene = useScenesStore((state) => state.renameScene);
  const getScenesForProject = useScenesStore((state) => state.getScenesForProject);
  const closeScenesPanel = useScenesStore((state) => state.closeScenesPanel);
  const isScenesPanelOpen = useScenesStore((state) => state.isScenesPanelOpen);
  const showToast = useUIStore((state) => state.showToast);

  const [newSceneName, setNewSceneName] = useState('');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  // Zweistufiges Löschen (wie im Papierkorb) statt window.confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isScenesPanelOpen || !currentProjectId) return null;

  const projectScenes = getScenesForProject(currentProjectId);
  const projectCards = cards.filter((c) => c.projectId === currentProjectId);
  const projectZones = zones.filter((z) => z.projectId === currentProjectId);

  const handleSaveScene = () => {
    if (!newSceneName.trim()) {
      showToast(t('Bitte gib einen Namen ein'));
      return;
    }

    // Capture current card states
    const cardStates: SceneCardState[] = projectCards.map((card) => ({
      cardId: card.id,
      position: { ...card.position },
      zIndex: card.zIndex,
    }));

    // Capture current zone states
    const zoneStates: SceneZoneState[] = projectZones.map((zone) => ({
      zoneId: zone.id,
      position: { ...zone.position },
      width: zone.width,
      height: zone.height,
    }));

    createScene(
      currentProjectId,
      newSceneName.trim(),
      cardStates,
      zoneStates,
      { ...position },
      scale
    );

    setNewSceneName('');
    showToast(t('Szene gespeichert'));
  };

  const handleRestoreScene = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    // Restore card positions
    for (const cardState of scene.cardStates) {
      const card = cards.find((c) => c.id === cardState.cardId);
      if (card) {
        updatePosition(cardState.cardId, cardState.position);
        // Restore z-index by bringing to front in order
      }
    }

    // Sort by zIndex and bring to front in order to restore z-order
    // Nacheinander abwarten – sonst bekämen alle Karten denselben zIndex
    const sortedCardStates = [...scene.cardStates].sort((a, b) => a.zIndex - b.zIndex);
    for (const cardState of sortedCardStates) {
      await bringToFront(cardState.cardId);
    }

    // Restore zone positions and sizes
    for (const zoneState of scene.zoneStates) {
      const zone = zones.find((z) => z.id === zoneState.zoneId);
      if (zone) {
        updateZone(zoneState.zoneId, {
          position: zoneState.position,
          width: zoneState.width,
          height: zoneState.height,
        });
      }
    }

    // Restore canvas position and scale
    setPosition(scene.canvasPosition);
    setScale(scene.canvasScale);

    showToast(t('Szene "{name}" wiederhergestellt', { name: scene.name }));
  };

  const handleDeleteScene = (sceneId: string) => {
    if (confirmDeleteId !== sceneId) {
      setConfirmDeleteId(sceneId);
      return;
    }
    setConfirmDeleteId(null);
    deleteScene(sceneId);
    showToast(t('Szene gelöscht'));
  };

  const handleStartRename = (sceneId: string, currentName: string) => {
    setEditingSceneId(sceneId);
    setEditingName(currentName);
  };

  const handleRename = (sceneId: string) => {
    if (editingName.trim()) {
      renameScene(sceneId, editingName.trim());
      showToast(t('Szene umbenannt'));
    }
    setEditingSceneId(null);
    setEditingName('');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(dateLocale(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 z-40 max-w-md w-full mx-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span className="text-xl">🎬</span>
          {t('Szenen')}
        </h3>
        <button
          onClick={closeScenesPanel}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Save new scene */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newSceneName}
          onChange={(e) => setNewSceneName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveScene();
          }}
          placeholder={t('Name der neuen Szene...')}
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          onClick={handleSaveScene}
          className="px-4 py-2 bg-primary-blue text-white rounded-full hover:brightness-105 transition-all text-sm font-semibold"
        >
          {t('Speichern')}
        </button>
      </div>

      {/* Scenes list */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {projectScenes.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p className="text-3xl mb-2">📷</p>
            <p className="text-sm">{t('Noch keine Szenen gespeichert')}</p>
            <p className="text-xs mt-1 text-gray-400">
              {t('Speichere die aktuelle Anordnung als Szene')}
            </p>
          </div>
        ) : (
          projectScenes.map((scene) => (
            <div
              key={scene.id}
              className="bg-gray-50 rounded-xl p-3 flex items-center justify-between group"
            >
              <div className="flex-1 min-w-0">
                {editingSceneId === scene.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleRename(scene.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(scene.id);
                      if (e.key === 'Escape') {
                        setEditingSceneId(null);
                        setEditingName('');
                      }
                    }}
                    autoFocus
                    className="w-full px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                ) : (
                  <button
                    onClick={() => handleStartRename(scene.id, scene.name)}
                    className="text-left w-full"
                  >
                    <p className="font-medium text-gray-800 truncate">{scene.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(scene.createdAt)} ·{' '}
                      {scene.cardStates.length === 1
                        ? t('1 Karte')
                        : t('{n} Karten', { n: scene.cardStates.length })}
                    </p>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 ml-2">
                {/* Restore button */}
                <button
                  onClick={() => handleRestoreScene(scene.id)}
                  className="p-2 hover:bg-primary-blue hover:text-white rounded-lg transition-colors text-gray-600"
                  title={t('Szene wiederherstellen')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                {/* Delete button (zweistufig) */}
                {confirmDeleteId === scene.id ? (
                  <button
                    onClick={() => handleDeleteScene(scene.id)}
                    onBlur={() => setConfirmDeleteId(null)}
                    autoFocus
                    className="px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold transition-colors hover:brightness-105"
                  >
                    {t('Wirklich löschen?')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleDeleteScene(scene.id)}
                    className="p-2 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors text-gray-400 opacity-0 group-hover:opacity-100"
                    title={t('Szene löschen')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info text */}
      <p className="text-xs text-gray-400 mt-3 text-center">
        {t('Szenen speichern Positionen von Karten und Bereichen')}
      </p>
    </div>
  );
}
