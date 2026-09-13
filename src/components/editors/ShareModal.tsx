import { useState } from 'react';
import { Modal } from '../common';
import { LazyQRCode } from '../common/LazyQRCode';
import { useUIStore, useProjectStore, useZonesStore } from '../../stores';
import { generateShareUrl } from '../../utils/shareUtils';
import { useT } from '../../i18n';

export function ShareModal() {
  const t = useT();
  const { closeModal, showToast } = useUIStore();
  const { getCurrentProject } = useProjectStore();
  const { getZonesForProject } = useZonesStore();
  const [copied, setCopied] = useState(false);

  const project = getCurrentProject();
  if (!project) return null;

  const zones = getZonesForProject(project.id);
  const shareUrl = generateShareUrl(project.name, zones);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast(t('Link kopiert!'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t('Kopieren fehlgeschlagen'));
    }
  };

  return (
    <Modal onClose={closeModal} title={t('Projekt teilen')} size="md">
      <div className="flex flex-col items-center gap-6">
        {/* QR Code */}
        <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100">
          <LazyQRCode value={shareUrl} size={200} />
        </div>

        {/* Info */}
        <p className="text-center text-gray-600 text-sm">
          {t('Teile diesen Link oder QR-Code, damit andere')}
          <br />
          {zones.length === 0
            ? t('ein Projekt mit keinen Bereichen erstellen.')
            : zones.length === 1
            ? t('ein Projekt mit 1 Bereich erstellen.')
            : t('ein Projekt mit {n} Bereichen erstellen.', { n: zones.length })}
        </p>

        {/* Link with copy button */}
        <div className="w-full">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 bg-transparent text-sm text-gray-600 px-2 outline-none truncate"
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopyLink}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                copied
                  ? 'bg-green-500 text-white'
                  : 'bg-pastel-blue text-gray-700 hover:bg-pastel-blue/80'
              }`}
            >
              {copied ? t('Kopiert!') : t('Kopieren')}
            </button>
          </div>
        </div>

        {/* Note about what gets shared */}
        <div className="w-full bg-yellow-50 border border-yellow-200 rounded-xl p-3">
          <p className="text-xs text-yellow-800 text-center">
            {t('Es werden nur Projektname und Bereiche geteilt.')}
            <br />
            {t('Karten und Inhalte werden nicht geteilt.')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
