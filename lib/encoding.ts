/**
 * Encoding detector and decoder supporting:
 * - UTF-8
 * - UTF-8 with BOM (0xEF 0xBB 0xBF)
 * - UTF-16LE with BOM (0xFF 0xFE)
 * - UTF-16LE without BOM (detected via null-byte pattern in ASCII text)
 * - UTF-16BE with BOM (0xFE 0xFF)
 * - Fallback to Windows-1252/ISO-8859-1
 */

export interface DecodedResult {
  text: string;
  encoding: string;
  hasBom: boolean;
}

export function decodeFileBuffer(buffer: ArrayBuffer | Uint8Array): DecodedResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.length === 0) {
    return { text: '', encoding: 'empty', hasBom: false };
  }

  // 1. Check for explicit Byte Order Marks (BOM)
  // UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(bytes.subarray(3));
    return { text, encoding: 'UTF-8 with BOM', hasBom: true };
  }

  // UTF-16LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const decoder = new TextDecoder('utf-16le');
    const text = decoder.decode(bytes.subarray(2));
    return { text, encoding: 'UTF-16LE with BOM', hasBom: true };
  }

  // UTF-16BE BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const decoder = new TextDecoder('utf-16be');
    const text = decoder.decode(bytes.subarray(2));
    return { text, encoding: 'UTF-16BE with BOM', hasBom: true };
  }

  // 2. Heuristic check for UTF-16LE without BOM:
  // In broadcast log files formatted in UTF-16LE (e.g. "13-10-2026"), the high byte of ASCII chars is 0x00.
  // Sample up to first 256 bytes.
  const sampleSize = Math.min(bytes.length, 256);
  let nullEvenCount = 0;
  let nullOddCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    if (bytes[i] === 0x00) {
      if (i % 2 === 0) nullEvenCount++;
      else nullOddCount++;
    }
  }

  // If odd bytes have many 0x00 and even bytes have very few, it's UTF-16LE
  if (sampleSize >= 4 && nullOddCount > sampleSize / 4 && nullEvenCount < sampleSize / 10) {
    try {
      const decoder = new TextDecoder('utf-16le');
      const text = decoder.decode(bytes);
      return { text, encoding: 'UTF-16LE (heuristic)', hasBom: false };
    } catch {
      // Fall through to UTF-8
    }
  }

  // If even bytes have many 0x00 and odd bytes have very few, it's UTF-16BE
  if (sampleSize >= 4 && nullEvenCount > sampleSize / 4 && nullOddCount < sampleSize / 10) {
    try {
      const decoder = new TextDecoder('utf-16be');
      const text = decoder.decode(bytes);
      return { text, encoding: 'UTF-16BE (heuristic)', hasBom: false };
    } catch {
      // Fall through to UTF-8
    }
  }

  // 3. Default to UTF-8 with fatal: false
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(bytes);
    return { text, encoding: 'UTF-8', hasBom: false };
  } catch {
    // 4. Fallback to windows-1252
    const decoder = new TextDecoder('windows-1252');
    const text = decoder.decode(bytes);
    return { text, encoding: 'Windows-1252 (fallback)', hasBom: false };
  }
}
