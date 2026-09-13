import { useState } from 'react';
import { Modal, Button, CARD_TYPE_LABELS, CARD_TYPE_ICONS } from '../common';
import { useCardsStore, useUIStore, useProjectStore, useZonesStore } from '../../stores';
import { groupService } from '../../services/db/database';
import { useT } from '../../i18n';

const GROUP_COLORS = [
  '#98D8C8', // Mint
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#DDA0DD', // Plum
  '#FFEAA7', // Yellow
  '#F7DC6F', // Gold
  '#FF6B6B', // Red
];

export function GroupsPanel() {
  const {
    groups,
    cards,
    renameGroup,
    removeCardFromGroup,
    deleteGroup,
  } = useCardsStore();
  const { closeModal, showToast } = useUIStore();
  const { currentProjectId } = useProjectStore();
  const { getZoneByGroupId, updateZone } = useZonesStore();
  const t = useT();

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [colorPickerGroupId, setColorPickerGroupId] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  // Filter groups by current project
  const projectGroups = groups.filter((g) => g.projectId === currentProjectId);

  const handleRename = async (groupId: string) => {
    if (editingName.trim()) {
      await renameGroup(groupId, editingName.trim());
      showToast(t('Gruppe umbenannt'));
    }
    setEditingGroupId(null);
    setEditingName('');
  };

  const handleStartRename = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingName(currentName || '');
  };

  const handleChangeColor = async (groupId: string, color: string) => {
    // Persist to IndexedDB
    try {
      await groupService.update(groupId, { color });
    } catch (error) {
      console.error('Failed to persist group color:', error);
    }

    // Update group color in store
    useCardsStore.setState((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, color } : g
      ),
    }));

    // Also update linked zone color
    const linkedZone = getZoneByGroupId(groupId);
    if (linkedZone) {
      // Convert hex to rgba for zone
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      if (result) {
        const rgba = `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, 0.3)`;
        await updateZone(linkedZone.id, { color: rgba });
      }
    }

    setColorPickerGroupId(null);
    showToast(t('Farbe geändert'));
  };

  // Zweistufiges Löschen ohne window.confirm (wie TrashModal.handleDeleteAll)
  const handleDeleteGroup = async (groupId: string) => {
    if (confirmDeleteGroupId !== groupId) {
      setConfirmDeleteGroupId(groupId);
      return;
    }
    setConfirmDeleteGroupId(null);
    await deleteGroup(groupId);
    showToast(t('Gruppe gelöscht'));
  };

  const handleRemoveCard = async (groupId: string, cardId: string) => {
    await removeCardFromGroup(groupId, cardId);
    showToast(t('Karte aus Gruppe entfernt'));
  };

  const getCardPreview = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return { icon: '📄', label: t('Unbekannt') };

    // Übersetzte Typnamen statt roher Typ-IDs („Photo-Karte")
    return {
      icon: CARD_TYPE_ICONS[card.type] || '📄',
      label: card.label || t('{type}-Karte', { type: t(CARD_TYPE_LABELS[card.type]) }),
    };
  };

  return (
    <Modal title={t('Gruppen & Bereiche')} onClose={closeModal} size="lg">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {projectGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-4xl mb-4">📦</p>
            <p>{t('Keine Gruppen/Bereiche vorhanden')}</p>
            <p className="text-sm mt-2">
              {t('Zeichne einen Bereich auf dem Canvas, um eine Gruppe zu erstellen')}
            </p>
          </div>
        ) : (
          projectGroups.map((group) => (
            <div
              key={group.id}
              className="border rounded-xl overflow-hidden"
              style={{ borderColor: group.color, borderWidth: 2 }}
            >
              {/* Group header */}
              <div
                className="p-4 flex items-center justify-between"
                style={{ backgroundColor: `${group.color}20` }}
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Color indicator - clickable to change color */}
                  <div className="relative">
                    <button
                      onClick={() => setColorPickerGroupId(colorPickerGroupId === group.id ? null : group.id)}
                      className="w-6 h-6 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                      style={{ backgroundColor: group.color }}
                      title={t('Farbe ändern')}
                    />
                    {colorPickerGroupId === group.id && (
                      <div className="absolute top-8 left-0 bg-white rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-24 z-10">
                        {GROUP_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleChangeColor(group.id, color)}
                            className="w-5 h-5 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            aria-label={t('Farbe {color}', { color })}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name editing */}
                  {editingGroupId === group.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRename(group.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(group.id);
                        if (e.key === 'Escape') {
                          setEditingGroupId(null);
                          setEditingName('');
                        }
                      }}
                      autoFocus
                      className="flex-1 px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <button
                      onClick={() => handleStartRename(group.id, group.name || '')}
                      className="flex-1 text-left font-medium text-gray-800 hover:text-blue-600"
                    >
                      {group.name || t('Unbenannte Gruppe')}
                    </button>
                  )}

                  {/* Card count */}
                  <span className="text-sm text-gray-500">
                    {t('{n} Karten', { n: group.cardIds.length })}
                  </span>
                </div>

                {/* Expand/collapse button */}
                <button
                  onClick={() =>
                    setExpandedGroupId(expandedGroupId === group.id ? null : group.id)
                  }
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${
                      expandedGroupId === group.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              {/* Group actions */}
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleStartRename(group.id, group.name || '')}
                >
                  {t('Umbenennen')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDeleteGroup(group.id)}
                >
                  {confirmDeleteGroupId === group.id
                    ? t('Wirklich löschen? Karten bleiben erhalten.')
                    : t('Löschen')}
                </Button>
              </div>

              {/* Expanded card list */}
              {expandedGroupId === group.id && (
                <div className="px-4 pb-4 pt-2 bg-gray-50 border-t">
                  <p className="text-xs text-gray-500 mb-2">{t('Karten in dieser Gruppe:')}</p>
                  <div className="space-y-2">
                    {group.cardIds.map((cardId) => {
                      const { icon, label } = getCardPreview(cardId);
                      return (
                        <div
                          key={cardId}
                          className="flex items-center justify-between bg-white rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span>{icon}</span>
                            <span className="text-sm text-gray-700">{label}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveCard(group.id, cardId)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title={t('Aus Gruppe entfernen')}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={closeModal}>{t('Schließen')}</Button>
      </div>
    </Modal>
  );
}
