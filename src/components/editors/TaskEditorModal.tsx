import { useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Modal } from '../common';
import type { TaskCard, ChecklistItem } from '../../types';
import { useCardsStore, useUIStore, useProjectStore } from '../../stores';
import { useT } from '../../i18n';

interface TaskEditorModalProps {
  card?: TaskCard;
}

// Editor für Aufgabenkarten (wie iOS TaskEditorSheet):
// Aufgabentext, gestufte Tipps, Checkliste
export function TaskEditorModal({ card }: TaskEditorModalProps) {
  const t = useT();
  const [taskText, setTaskText] = useState(card?.taskText ?? '');
  const [label, setLabel] = useState(card?.label ?? '');
  const [hints, setHints] = useState<string[]>(card?.hints ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card?.checklist ?? []);

  const { addTaskCard, updateCard, deleteCard } = useCardsStore();
  const { closeModal, showToast } = useUIStore();
  const { currentProjectId } = useProjectStore();

  const taskTextRef = useRef<HTMLTextAreaElement>(null);

  // Felder beim Kartenwechsel neu laden (state-adjust during render, wie TextEditor)
  const [prevCardId, setPrevCardId] = useState(card?.id ?? null);
  if (prevCardId !== (card?.id ?? null)) {
    setPrevCardId(card?.id ?? null);
    setTaskText(card?.taskText ?? '');
    setLabel(card?.label ?? '');
    setHints(card?.hints ?? []);
    setChecklist(card?.checklist ?? []);
  }

  const handleSave = async () => {
    const cleanHints = hints.map((h) => h.trim()).filter(Boolean);
    const cleanChecklist = checklist
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);

    // Ohne Aufgabentext nicht still abbrechen, sondern erklären und fokussieren
    if (!taskText.trim()) {
      showToast(t('Bitte zuerst einen Aufgabentext eingeben'));
      taskTextRef.current?.focus();
      return;
    }

    if (card) {
      await updateCard(card.id, {
        taskText: taskText.trim(),
        hints: cleanHints,
        checklist: cleanChecklist,
        label: label.trim() || undefined,
      });
      showToast(t('Aufgabe gespeichert'));
    } else if (currentProjectId) {
      const created = await addTaskCard(currentProjectId, taskText.trim(), cleanHints, cleanChecklist);
      if (label.trim()) {
        await updateCard(created.id, { label: label.trim() });
      }
      showToast(t('Aufgabe erstellt'));
    }
    closeModal();
  };

  const handleDelete = async () => {
    if (!card) return;
    await deleteCard(card.id);
    showToast(t('Aufgabe gelöscht'));
    closeModal();
  };

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      onSave={handleSave}
      title={t('Aufgabe')}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="space-y-5">
        {/* Bezeichnung */}
        <div>
          <label htmlFor="task-label" className="block text-sm font-medium text-ink-soft mb-1">
            {t('Bezeichnung')}
          </label>
          <input
            id="task-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('z.B. Aufgabe 1')}
            className="w-full px-4 py-2 rounded-xl bg-[#F5F7FA] border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-blue"
          />
        </div>

        {/* Aufgabentext */}
        <div>
          <label htmlFor="task-text" className="block text-sm font-medium text-ink-soft mb-1">
            {t('Aufgabentext')}
          </label>
          <textarea
            id="task-text"
            ref={taskTextRef}
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder={t('Was sollen die Kinder tun?')}
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-[#F5F7FA] border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-blue resize-none"
            autoFocus
          />
        </div>

        {/* Tipps */}
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            {t('Gestufte Tipps')} <span className="font-normal">{t('(werden nacheinander aufgedeckt)')}</span>
          </label>
          <div className="space-y-2">
            {hints.map((hint, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-primary-orange shrink-0">💡</span>
                <input
                  type="text"
                  value={hint}
                  autoFocus={hint === ''}
                  onChange={(e) => {
                    const next = [...hints];
                    next[index] = e.target.value;
                    setHints(next);
                  }}
                  placeholder={t('Tipp {n}', { n: index + 1 })}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#F5F7FA] border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-blue text-sm"
                />
                <button
                  type="button"
                  onClick={() => setHints(hints.filter((_, i) => i !== index))}
                  className="text-red-400 hover:text-red-600 p-1"
                  aria-label={t('Tipp {n} entfernen', { n: index + 1 })}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setHints([...hints, ''])}
              className="text-sm font-medium text-primary-blue hover:brightness-110"
            >
              {t('+ Tipp hinzufügen')}
            </button>
          </div>
        </div>

        {/* Checkliste */}
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            {t('Checkliste')}
          </label>
          <div className="space-y-2">
            {checklist.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border-2 border-gray-300 shrink-0" />
                <input
                  type="text"
                  value={item.text}
                  autoFocus={item.text === ''}
                  onChange={(e) => {
                    const next = [...checklist];
                    next[index] = { ...item, text: e.target.value };
                    setChecklist(next);
                  }}
                  placeholder={t('Schritt {n}', { n: index + 1 })}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#F5F7FA] border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-blue text-sm"
                />
                <button
                  type="button"
                  onClick={() => setChecklist(checklist.filter((c) => c.id !== item.id))}
                  className="text-red-400 hover:text-red-600 p-1"
                  aria-label={t('Schritt {n} entfernen', { n: index + 1 })}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setChecklist([...checklist, { id: uuid(), text: '', isChecked: false }])}
              className="text-sm font-medium text-primary-blue hover:brightness-110"
            >
              {t('+ Schritt hinzufügen')}
            </button>
          </div>
        </div>

        {/* Löschen */}
        {card && (
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={handleDelete}
              className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
            >
              {t('Aufgabe löschen')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
