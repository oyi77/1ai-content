/**
 * Media utilities — download/encode media to base64, Gemini URL builder.
 */
import { readFile } from 'fs/promises';
import { extname } from 'path';
import axios from 'axios';
import { getConfig } from '@/config/env';

/**
 * Build Gemini vision API URL from config.
 */
export function getGeminiVisionUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${getConfig().GEMINI_API_KEY || ''}`;
}

/**
 * Infer MIME type from file extension or magic bytes.
 */
function inferMimeType(filename: string, buf: Buffer): string {
  const ext = extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  // Magic bytes fallback
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  return 'image/jpeg';
}

/**
 * Fetch media (HTTP URL or local path) as base64 with MIME type.
 */
export async function fetchMediaAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const isLocal = !url.startsWith('http://') && !url.startsWith('https://');
  if (isLocal) {
    const localPath = url.startsWith('file://') ? url.slice(7) : url;
    const buf = await readFile(localPath);
    return { data: buf.toString('base64'), mimeType: inferMimeType(localPath, buf) };
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  // Detect real MIME type from headers, URL extension, or magic bytes
  let contentType = String(response.headers['content-type'] || 'image/jpeg');
  if (contentType === 'application/octet-stream' || (contentType && !contentType.startsWith('image/'))) {
    if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
    else if (url.includes('.png')) contentType = 'image/png';
    else if (url.includes('.webp')) contentType = 'image/webp';
    else if (url.includes('.gif')) contentType = 'image/gif';
    else if (url.includes('.mp4')) contentType = 'video/mp4';
    else {
      const buf = Buffer.from(response.data);
      contentType = inferMimeType(url, buf);
    }
  }

  const base64 = Buffer.from(response.data).toString('base64');
  return { data: base64, mimeType: String(contentType) };
}
