import sharp from 'sharp';
import {MAX_FILE} from './engine.mjs';

export async function inspectImage(bytes) {
  if (!bytes?.length || bytes.length > MAX_FILE) return null;
  try {
    const image = sharp(bytes, {limitInputPixels:16000000, failOn:'warning'});
    const {format,pages} = await image.metadata();
    if ((pages ?? 1) !== 1 || !['jpeg','png'].includes(format)) return null;
    await image.raw().toBuffer();
    return format === 'jpeg' ? 'jpg' : 'png';
  } catch {
    return null;
  }
}
