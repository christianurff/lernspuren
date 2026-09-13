import { Modal, ImageCropView } from '../common';
import { useUIStore } from '../../stores';
import { useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { useT } from '../../i18n';

/**
 * Zuschneiden eines Bild-Elements im Buch. Das Element behält seinen Maßstab
 * auf der Seite: Breite und Höhe schrumpfen anteilig zum Ausschnitt.
 */
export function ImageCropModal() {
  const t = useT();
  const croppingItemId = useBookUIStore((s) => s.croppingItemId);
  const stopCrop = useBookUIStore((s) => s.stopCrop);
  const items = useBookStore((s) => s.items);
  const updateItem = useBookStore((s) => s.updateItem);
  const showToast = useUIStore((s) => s.showToast);

  const item = items.find((it) => it.id === croppingItemId);
  if (!item || item.type !== 'image') return null;

  return (
    <Modal isOpen onClose={stopCrop} title={t('Bild zuschneiden')} size="lg" closeOnBackdrop={false}>
      <ImageCropView
        imageData={item.imageData}
        onCancel={stopCrop}
        onApply={async ({ imageData, thumbnailData, cropWidth, cropHeight }) => {
          // Maßstab auf der Seite beibehalten: das Element schrumpft anteilig
          const width = Math.max(40, Math.round(item.width * cropWidth));
          const height = Math.max(40, Math.round(item.height * cropHeight));
          const x = item.x + (item.width - width) / 2;
          const y = item.y + (item.height - height) / 2;
          await updateItem(item.id, { imageData, thumbnailData, width, height, x, y });
          showToast(t('Bild zugeschnitten'));
          stopCrop();
        }}
      />
    </Modal>
  );
}
