import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore, useZonesStore, useUIStore, useCardsStore } from '../stores';
import { getShareParamFromUrl, decodeShareData } from '../utils/shareUtils';
import { t } from '../i18n';

/**
 * Convert RGBA color string to hex color
 * e.g., "rgba(255, 209, 220, 0.4)" -> "#FFD1DC"
 */
function rgbaToHex(rgba: string): string {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#98D8C8'; // Default mint color

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);

  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function useShareImport() {
  const navigate = useNavigate();
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const handleImport = async () => {
      const shareParam = getShareParamFromUrl();
      if (!shareParam || isImporting) return;

      setIsImporting(true);

      const decoded = decodeShareData(shareParam);
      if (!decoded) {
        useUIStore.getState().showToast(t('Ungültiger Teilen-Link'));
        window.history.replaceState({}, '', window.location.pathname);
        setIsImporting(false);
        return;
      }

      try {
        const project = await useProjectStore.getState().createProject(decoded.projectName, '#FFFFFF');

        for (const zone of decoded.zones) {
          const hexColor = rgbaToHex(zone.color);
          const group = await useCardsStore.getState().createEmptyGroup(project.id, zone.name, hexColor);

          await useZonesStore.getState().createZone(
            project.id,
            zone.position,
            zone.width,
            zone.height,
            zone.color,
            zone.name,
            group.id
          );
        }

        window.history.replaceState({}, '', window.location.pathname);

        useProjectStore.getState().setCurrentProject(project.id);
        navigate(`/canvas/${project.id}`);
        useUIStore.getState().showToast(t('Projekt "{name}" importiert', { name: decoded.projectName }));
      } catch (error) {
        console.error('Failed to import project:', error);
        useUIStore.getState().showToast(t('Fehler beim Importieren'));
        window.history.replaceState({}, '', window.location.pathname);
      }

      setIsImporting(false);
    };

    handleImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return { isImporting };
}
