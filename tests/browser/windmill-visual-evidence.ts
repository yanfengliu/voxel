import type { Page } from '@playwright/test';

function pngDataUrl(image: Buffer): string {
  return `data:image/png;base64,${image.toString('base64')}`;
}

export async function compareWindmillPngs(
  page: Page,
  left: Buffer,
  right: Buffer,
) {
  return page.evaluate(async ({ leftUrl, rightUrl }) => {
    const decode = async (url: string) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) {
        throw new Error(
          'Cannot decode Windmill visual evidence: the browser refused a 2D context.',
        );
      }
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        pixels:
          context.getImageData(0, 0, image.width, image.height).data,
      };
    };
    const [leftImage, rightImage] = await Promise.all([
      decode(leftUrl),
      decode(rightUrl),
    ]);
    if (leftImage.width !== rightImage.width
      || leftImage.height !== rightImage.height) {
      throw new Error(
        `Cannot compare Windmill visual evidence: ${
          String(leftImage.width)
        }x${String(leftImage.height)} does not match ${
          String(rightImage.width)
        }x${String(rightImage.height)}.`,
      );
    }
    let differingPixels = 0;
    let maximumChannelDelta = 0;
    for (let offset = 0; offset < leftImage.pixels.length; offset += 4) {
      let pixelDiffers = false;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(
          leftImage.pixels[offset + channel]!
            - rightImage.pixels[offset + channel]!,
        );
        maximumChannelDelta = Math.max(maximumChannelDelta, delta);
        if (delta > 0) pixelDiffers = true;
      }
      if (pixelDiffers) differingPixels += 1;
    }
    return {
      differingPixels,
      maximumChannelDelta,
      totalPixels: leftImage.width * leftImage.height,
    };
  }, {
    leftUrl: pngDataUrl(left),
    rightUrl: pngDataUrl(right),
  });
}

/**
 * Measures the model silhouette against the dominant canvas-border backdrop
 * after the Studio chrome and SVG overlays are hidden. A relative mask is
 * required here: fixed-side Windmill materials can be intentionally darker
 * than an absolute display-brightness cutoff while remaining clearly distinct
 * from the stage.
 */
export async function inspectWindmillPngFootprint(
  page: Page,
  image: Buffer,
) {
  return page.evaluate(async (imageUrl) => {
    const decoded = new Image();
    decoded.src = imageUrl;
    await decoded.decode();
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error(
        'Cannot decode Windmill visual evidence: the browser refused a 2D context.',
      );
    }
    context.drawImage(decoded, 0, 0);
    const pixels =
      context.getImageData(0, 0, decoded.width, decoded.height).data;
    const borderColors = new Map<string, number>();
    const countBorderColor = (x: number, y: number) => {
      const offset = (y * decoded.width + x) * 4;
      const key = [
        pixels[offset]! >> 2,
        pixels[offset + 1]! >> 2,
        pixels[offset + 2]! >> 2,
      ].join(',');
      borderColors.set(key, (borderColors.get(key) ?? 0) + 1);
    };
    for (let x = 0; x < decoded.width; x += 4) {
      countBorderColor(x, 0);
      countBorderColor(x, decoded.height - 1);
    }
    for (let y = 4; y < decoded.height - 1; y += 4) {
      countBorderColor(0, y);
      countBorderColor(decoded.width - 1, y);
    }
    const backdrop = [...borderColors.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0];
    if (backdrop === undefined) {
      throw new Error(
        'Cannot inspect Windmill visual evidence: the PNG has no border pixels.',
      );
    }
    const backdropChannels = backdrop[0].split(',').map(
      (channel) => Number(channel) * 4 + 1.5,
    );
    let foregroundPixels = 0;
    let minimumX = decoded.width;
    let minimumY = decoded.height;
    let maximumX = -1;
    let maximumY = -1;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      const contrast = Math.max(
        Math.abs(red - backdropChannels[0]!),
        Math.abs(green - backdropChannels[1]!),
        Math.abs(blue - backdropChannels[2]!),
      );
      if (contrast < 12) continue;
      const pixel = offset / 4;
      const x = pixel % decoded.width;
      const y = Math.floor(pixel / decoded.width);
      foregroundPixels += 1;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
    return {
      foregroundPixels,
      widthFraction:
        maximumX < minimumX
          ? 0
          : (maximumX - minimumX + 1) / decoded.width,
      heightFraction:
        maximumY < minimumY
          ? 0
          : (maximumY - minimumY + 1) / decoded.height,
    };
  }, pngDataUrl(image));
}
