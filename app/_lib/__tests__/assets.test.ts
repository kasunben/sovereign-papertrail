import { Jimp, JimpMime } from 'jimp';
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_DIMENSION, OUTPUT_CONTENT_TYPE, processImageUpload, THUMBNAIL_DIMENSION } from '../assets';

async function makeImageBuffer(width: number, height: number): Promise<Buffer> {
  const image = new Jimp({ width, height, color: 0x336699ff });
  return image.getBuffer(JimpMime.png);
}

describe('processImageUpload', () => {
  it('caps a large landscape image at the max dimension on the long edge', async () => {
    const input = await makeImageBuffer(2800, 1400);

    const { full, thumbnail } = await processImageUpload(input);

    expect(Math.max(full.width, full.height)).toBe(MAX_IMAGE_DIMENSION);
    expect(full.width / full.height).toBeCloseTo(2, 1);
    expect(Math.max(thumbnail.width, thumbnail.height)).toBe(THUMBNAIL_DIMENSION);
    expect(full.contentType).toBe(OUTPUT_CONTENT_TYPE);
  });

  it('caps a large portrait image on the long edge, not just width', async () => {
    const input = await makeImageBuffer(1000, 3000);

    const { full } = await processImageUpload(input);

    expect(full.height).toBe(MAX_IMAGE_DIMENSION);
    expect(full.width).toBeLessThan(MAX_IMAGE_DIMENSION);
  });

  it('does not upscale an image already smaller than the caps', async () => {
    const input = await makeImageBuffer(100, 50);

    const { full, thumbnail } = await processImageUpload(input);

    expect(full.width).toBe(100);
    expect(full.height).toBe(50);
    expect(thumbnail.width).toBe(100);
    expect(thumbnail.height).toBe(50);
  });
});
