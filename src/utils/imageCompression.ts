const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB (echte Bytes, nicht Base64-Zeichen)
const THUMBNAIL_WIDTH = 200;
const MIN_QUALITY = 0.1;
const MIN_WIDTH = 320; // kleiner wird nicht mehr verkleinert

// Tatsächliche Bytegröße einer Data-URL: Base64 kodiert 3 Bytes in 4 Zeichen.
export function dataUrlByteSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export async function compressImage(
  file: File | Blob,
  maxWidth = 1920,
  maxHeight = 1920,
  initialQuality = 0.9
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Ein Durchgang mit fester Zielbreite: Qualität schrittweise senken
      const renderAtWidth = (limitWidth: number, limitHeight: number): string => {
        let { width, height } = img;
        if (width > limitWidth || height > limitHeight) {
          const ratio = Math.min(limitWidth / width, limitHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = initialQuality;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrlByteSize(dataUrl) > MAX_FILE_SIZE && quality > MIN_QUALITY) {
          quality = Math.round((quality - 0.1) * 10) / 10;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        return dataUrl;
      };

      // Reicht die Mindestqualität nicht, zusätzlich die Breite halbieren
      let limitWidth = maxWidth;
      let limitHeight = maxHeight;
      let dataUrl = renderAtWidth(limitWidth, limitHeight);

      while (dataUrlByteSize(dataUrl) > MAX_FILE_SIZE && limitWidth > MIN_WIDTH) {
        limitWidth = Math.max(MIN_WIDTH, Math.round(limitWidth / 2));
        limitHeight = Math.max(MIN_WIDTH, Math.round(limitHeight / 2));
        dataUrl = renderAtWidth(limitWidth, limitHeight);
      }

      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export async function createThumbnail(imageData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const ratio = THUMBNAIL_WIDTH / img.width;
      const width = THUMBNAIL_WIDTH;
      const height = Math.round(img.height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = imageData;
  });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
