/**
 * Vorschaubild aus einem Video: ein Einzelbild aus der Mitte als JPEG-Data-URL.
 * Schlägt etwas fehl (Codec, Timeout), kommt ein leerer String zurück –
 * das Vorschaubild ist überall optional.
 */
export function createVideoThumbnailFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve('');
    }, 3000);

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timeout);
      try {
        URL.revokeObjectURL(video.src);
      } catch {
        // Aufräumfehler ignorieren
      }
    };

    const captureFrame = () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          cleanup();
          resolve('');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = Math.round((200 / video.videoWidth) * video.videoHeight) || 150;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          cleanup();
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          cleanup();
          resolve('');
        }
      } catch {
        cleanup();
        resolve('');
      }
    };

    video.onloadedmetadata = () => {
      if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration / 2;
      }
    };
    video.onseeked = () => captureFrame();
    video.oncanplay = () => {
      setTimeout(() => {
        if (!cleaned) captureFrame();
      }, 500);
    };
    video.onerror = () => {
      cleanup();
      resolve('');
    };

    try {
      video.src = URL.createObjectURL(blob);
      video.load();
    } catch {
      cleanup();
      resolve('');
    }
  });
}
