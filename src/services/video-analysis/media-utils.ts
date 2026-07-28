/**
 * Fetch a URL as base64 for Gemini inline_data.
 * Handles application/octet-stream by inferring MIME from URL or magic bytes.
 */
import axios from 'axios';

export async function fetchMediaAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
  });

  let contentType: string = String(response.headers['content-type'] || 'video/mp4');

  if (
    contentType === 'application/octet-stream' ||
    (!contentType.startsWith('video/') && !contentType.startsWith('image/'))
  ) {
    if (url.includes('.mp4')) contentType = 'video/mp4';
    else if (url.includes('.webm')) contentType = 'video/webm';
    else if (url.includes('.mov')) contentType = 'video/quicktime';
    else if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
    else if (url.includes('.png')) contentType = 'image/png';
    else {
      const buf = Buffer.from(response.data);
      // MP4 ftyp box starts at offset 4
      const isMP4 =
        buf.length > 8 &&
        buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
      contentType = isMP4 ? 'video/mp4' : 'video/mp4';
    }
  }

  const base64 = Buffer.from(response.data).toString('base64');
  return { data: base64, mimeType: contentType };
}
