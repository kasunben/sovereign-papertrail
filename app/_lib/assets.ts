import { Jimp, JimpMime } from 'jimp';

/** Max long-edge dimension for the full-size re-encode (PTR-07). */
export const MAX_IMAGE_DIMENSION = 1400;
/** Max long-edge dimension for the thumbnail (PTR-07). */
export const THUMBNAIL_DIMENSION = 480;

const OUTPUT_MIME = JimpMime.jpeg;
export const OUTPUT_CONTENT_TYPE = OUTPUT_MIME;

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: string;
}

type JimpImage = Awaited<ReturnType<typeof Jimp.fromBuffer>>;

/**
 * `scaleToFit` upscales images smaller than the target box, which we don't
 * want here — a small source image should re-encode at its own size, not
 * balloon up to fill 1400px.
 */
async function encodeCappedAt(image: JimpImage, maxDimension: number): Promise<ProcessedImage> {
  const clone = image.clone();
  if (Math.max(clone.bitmap.width, clone.bitmap.height) > maxDimension) {
    clone.scaleToFit({ w: maxDimension, h: maxDimension });
  }
  const buffer = await clone.getBuffer(OUTPUT_MIME);
  return { buffer, width: clone.bitmap.width, height: clone.bitmap.height, contentType: OUTPUT_CONTENT_TYPE };
}

/**
 * Re-encodes an uploaded image into the two variants a board's image node
 * needs: a display copy capped at 1400px and a thumbnail capped at 480px.
 * Pure `jimp` — no native bindings, so the plugin installs cleanly on any
 * host (see SPEC.md Open Question §2 on the `sharp` alternative).
 */
export async function processImageUpload(
  input: Buffer | ArrayBuffer,
): Promise<{ full: ProcessedImage; thumbnail: ProcessedImage }> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const source = await Jimp.fromBuffer(bytes);

  const [full, thumbnail] = await Promise.all([
    encodeCappedAt(source, MAX_IMAGE_DIMENSION),
    encodeCappedAt(source, THUMBNAIL_DIMENSION),
  ]);

  return { full, thumbnail };
}
