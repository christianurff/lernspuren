import LZString from 'lz-string';
import type { Zone } from '../types';

// Compact share data structure for minimal URL size
interface CompactZone {
  n?: string;  // name (optional)
  c: string;   // color (RGBA)
  x: number;   // position X
  y: number;   // position Y
  w: number;   // width
  h: number;   // height
}

interface ShareData {
  v: number;           // version
  p: string;           // project name
  z: CompactZone[];    // zones
}

const SHARE_VERSION = 1;

/** Ein Link darf höchstens so viele Bereiche anlegen (Schutz vor manipulierten Links). */
export const MAX_SHARED_ZONES = 100;

/** Grenzen für Position und Größe, damit kaputte Werte nichts Unsinniges erzeugen. */
const MAX_COORDINATE = 100_000;
const MIN_ZONE_SIZE = 20;
const MAX_ZONE_SIZE = 20_000;

/** Zahl absichern: nur endliche Werte, auf [min, max] begrenzt. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/**
 * Encodes project name and zones into a compressed URL-safe string
 */
export function encodeShareData(projectName: string, zones: Zone[]): string {
  const shareData: ShareData = {
    v: SHARE_VERSION,
    p: projectName,
    z: zones.map(zone => ({
      ...(zone.name ? { n: zone.name } : {}),
      c: zone.color,
      x: Math.round(zone.position.x),
      y: Math.round(zone.position.y),
      w: Math.round(zone.width),
      h: Math.round(zone.height),
    })),
  };

  const jsonString = JSON.stringify(shareData);
  const compressed = LZString.compressToEncodedURIComponent(jsonString);
  return compressed;
}

/**
 * Decodes a compressed share string back into project data
 */
export function decodeShareData(encoded: string): { projectName: string; zones: Omit<Zone, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>[] } | null {
  try {
    const jsonString = LZString.decompressFromEncodedURIComponent(encoded);
    if (!jsonString) {
      console.error('Failed to decompress share data');
      return null;
    }

    const data = JSON.parse(jsonString) as ShareData;

    // Validate version
    if (data.v !== SHARE_VERSION) {
      console.warn('Share data version mismatch:', data.v, 'expected:', SHARE_VERSION);
      // Still try to parse for forward compatibility
    }

    // Validate required fields
    if (!data.p || typeof data.p !== 'string') {
      console.error('Invalid project name in share data');
      return null;
    }

    // Ein Teilen-Link ist nicht vertrauenswürdig: Anzahl begrenzen, Zahlen prüfen
    // und begrenzen, Texte kürzen.
    const rawZones = Array.isArray(data.z) ? data.z.slice(0, MAX_SHARED_ZONES) : [];
    const zones = rawZones
      .filter((z): z is CompactZone => typeof z === 'object' && z !== null)
      .map(z => ({
        name: typeof z.n === 'string' ? z.n.slice(0, 120) : undefined,
        color: typeof z.c === 'string' ? z.c.slice(0, 40) : 'rgba(152, 216, 200, 0.4)',
        position: {
          x: clampNumber(z.x, -MAX_COORDINATE, MAX_COORDINATE, 0),
          y: clampNumber(z.y, -MAX_COORDINATE, MAX_COORDINATE, 0),
        },
        width: clampNumber(z.w, MIN_ZONE_SIZE, MAX_ZONE_SIZE, 200),
        height: clampNumber(z.h, MIN_ZONE_SIZE, MAX_ZONE_SIZE, 200),
      }));

    return {
      projectName: data.p.slice(0, 120),
      zones,
    };
  } catch (error) {
    console.error('Failed to decode share data:', error);
    return null;
  }
}

/**
 * Generates the full share URL for the current project
 */
export function generateShareUrl(projectName: string, zones: Zone[]): string {
  const encoded = encodeShareData(projectName, zones);
  const baseUrl = window.location.origin;
  return `${baseUrl}?share=${encoded}`;
}

/**
 * Extracts share parameter from current URL
 */
export function getShareParamFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('share');
}
