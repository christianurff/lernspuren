import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { saveBlob, saveDataUrl } from '../../utils/nativeBridge';
import { Modal, Button } from '../common';
import { useUIStore, useProjectStore } from '../../stores';
import { buildCanvasFileForProject, exportCanvasFile } from '../../services/canvasFile';
import { ShareLinkModal } from '../common/ShareLinkModal';
import { useT } from '../../i18n';

interface ExportModalProps {
  stageRef: React.RefObject<{ toDataURL: (config?: { pixelRatio?: number }) => string } | null>;
}

export function ExportModal({ stageRef }: ExportModalProps) {
  const t = useT();
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'image' | 'pdf' | 'file'>('image');
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { closeModal, showToast } = useUIStore();
  const { getCurrentProject } = useProjectStore();
  const project = getCurrentProject();

  const handleExport = async () => {
    // Vollständige Datei (.lernspur): braucht keinen Canvas-Schnappschuss
    if (exportFormat === 'file') {
      if (!project) {
        showToast(t('Export nicht möglich'));
        return;
      }
      setIsExporting(true);
      try {
        await exportCanvasFile(project.id);
        showToast(t('Datei exportiert'));
        closeModal();
      } catch (error) {
        console.error('Export failed:', error);
        showToast(error instanceof Error ? error.message : t('Export fehlgeschlagen'));
      } finally {
        setIsExporting(false);
      }
      return;
    }

    if (!stageRef.current) {
      showToast(t('Export nicht möglich'));
      return;
    }

    setIsExporting(true);

    try {
      // Get the canvas data as a base64 image
      const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });

      if (exportFormat === 'image') {
        // Download as PNG
        await saveDataUrl(dataURL, `${project?.name || 'Dokumentenraum'}_${formatDate(new Date())}.png`);
        showToast(t('Bild exportiert'));
      } else {
        // Export as PDF
        const img = new Image();
        img.src = dataURL;

        img.onload = () => {
          // Calculate PDF dimensions (A4 landscape for wide canvases)
          const imgWidth = img.width;
          const imgHeight = img.height;
          const aspectRatio = imgWidth / imgHeight;

          let pdfWidth: number;
          let pdfHeight: number;
          let orientation: 'p' | 'l';

          if (aspectRatio > 1) {
            // Landscape
            orientation = 'l';
            pdfWidth = 297; // A4 landscape width in mm
            pdfHeight = pdfWidth / aspectRatio;
            if (pdfHeight > 210) {
              pdfHeight = 210;
              pdfWidth = pdfHeight * aspectRatio;
            }
          } else {
            // Portrait
            orientation = 'p';
            pdfHeight = 297; // A4 portrait height in mm
            pdfWidth = pdfHeight * aspectRatio;
            if (pdfWidth > 210) {
              pdfWidth = 210;
              pdfHeight = pdfWidth / aspectRatio;
            }
          }

          const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: [pdfWidth, pdfHeight],
          });

          pdf.addImage(dataURL, 'PNG', 0, 0, pdfWidth, pdfHeight);
          void saveBlob(pdf.output('blob'), `${project?.name || 'Dokumentenraum'}_${formatDate(new Date())}.pdf`, 'application/pdf');
          showToast(t('PDF exportiert'));
          setIsExporting(false);
          closeModal();
        };

        img.onerror = () => {
          showToast(t('Export fehlgeschlagen'));
          setIsExporting(false);
        };

        return; // Wait for image to load
      }

      closeModal();
    } catch (error) {
      console.error('Export failed:', error);
      showToast(t('Export fehlgeschlagen'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={closeModal} title={t('Projekt exportieren')}>
      <div className="space-y-6">
        <p className="text-gray-600">
          {t('Exportiere dein Projekt als Bild, PDF oder als vollständige Datei.')}
        </p>

        {/* Format selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('Format wählen')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setExportFormat('image')}
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl transition-colors ${
                exportFormat === 'image'
                  ? 'bg-pastel-blue ring-2 ring-blue-400'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-gray-700">{t('Bild (PNG)')}</span>
              <span className="text-xs text-gray-500">{t('Hohe Qualität')}</span>
            </button>

            <button
              onClick={() => setExportFormat('pdf')}
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl transition-colors ${
                exportFormat === 'pdf'
                  ? 'bg-pastel-blue ring-2 ring-blue-400'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-gray-700">PDF</span>
              <span className="text-xs text-gray-500">{t('Zum Drucken')}</span>
            </button>

            <button
              onClick={() => setExportFormat('file')}
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl transition-colors ${
                exportFormat === 'file'
                  ? 'bg-pastel-blue ring-2 ring-blue-400'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="font-medium text-gray-700">{t('Datei (.lernspur)')}</span>
              <span className="text-xs text-gray-500 text-center">{t('Komplett, zum Weitergeben und Importieren')}</span>
            </button>
          </div>
        </div>

        {/* Teilen per Link (Upload mit Ablaufdatum) */}
        <button
          type="button"
          onClick={() => setIsShareOpen(true)}
          disabled={!project}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-colors text-left disabled:opacity-50"
        >
          <svg className="w-9 h-9 text-gray-700 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path strokeLinecap="round" d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          <span>
            <span className="block font-medium text-gray-700">{t('Per Link teilen')}</span>
            <span className="block text-xs text-gray-500">{t('Komplette Pinnwand hochladen, Link und QR-Code mit Ablaufdatum')}</span>
          </span>
        </button>

        {/* Export button */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={closeModal} className="flex-1">
            {t('Abbrechen')}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1"
          >
            {isExporting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('Exportiere...')}
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('Exportieren')}
              </>
            )}
          </Button>
        </div>
      </div>

      {project && (
        <ShareLinkModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          projectId={project.id}
          projectName={project.name}
          kind="canvas"
          buildFile={() => buildCanvasFileForProject(project.id)}
        />
      )}
    </Modal>
  );
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
