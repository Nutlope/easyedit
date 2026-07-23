import {
  IMAGE_EDIT_MODEL_SPEC,
  type ImageEditDimensionSpec,
  type ImageEditModel,
} from "@/lib/model-config";

/**
 * Adjust a source image's dimensions for a given Together image-edit model.
 *
 * Each model enforces its own output-dimension rules (see IMAGE_EDIT_MODEL_SPEC
 * in lib/model-config.ts), verified against the live Together API. FLUX.2 models
 * keep the original scaling behavior unchanged when no model is supplied.
 */
export function getAdjustedDimensions(
  width: number,
  height: number,
  model?: ImageEditModel,
): { width: number; height: number } {
  const spec = model ? IMAGE_EDIT_MODEL_SPEC[model]?.dimensions : undefined;

  if (!spec || spec.strategy === "flux") {
    return fluxAdjust(width, height);
  }

  return fitArea(width, height, spec);
}

const roundToMultipleOf = (value: number, multiple: number) =>
  Math.round(value / multiple) * multiple;

/**
 * Original FLUX.2 scaling, preserved byte-for-byte so the existing FLUX path is
 * unchanged: longest side capped at 1024, shortest side floored at 64,
 * multiples of 16.
 */
function fluxAdjust(width: number, height: number) {
  const maxDim = 1024;
  const minDim = 64;

  const roundToMultipleOf16 = (n: number) => Math.round(n / 16) * 16;

  const aspectRatio = width / height;

  let scaledWidth = width;
  let scaledHeight = height;

  if (width > maxDim || height > maxDim) {
    if (aspectRatio >= 1) {
      scaledWidth = maxDim;
      scaledHeight = Math.round(maxDim / aspectRatio);
    } else {
      scaledHeight = maxDim;
      scaledWidth = Math.round(maxDim * aspectRatio);
    }
  }

  const adjustedWidth = Math.min(
    maxDim,
    Math.max(minDim, roundToMultipleOf16(scaledWidth)),
  );
  const adjustedHeight = Math.min(
    maxDim,
    Math.max(minDim, roundToMultipleOf16(scaledHeight)),
  );

  return { width: adjustedWidth, height: adjustedHeight };
}

/**
 * Scale preserving aspect so total pixel area lands in [areaMin, areaMax].
 * Seedream-5.0-lite validates total area rather than side length, so the
 * sides are derived from a target area.
 */
function fitArea(width: number, height: number, spec: ImageEditDimensionSpec) {
  const {
    areaMin = 0,
    areaMax = Infinity,
    areaTarget = 0,
    aspectMin,
    aspectMax,
    multipleOf,
  } = spec;
  const landscape = width >= height;
  const long0 = Math.max(width, height);
  const short0 = Math.min(width, height);
  const aspect = Math.min(aspectMax, Math.max(aspectMin, long0 / short0));

  // area = long * short = long * (long / aspect) = long^2 / aspect
  // => long = sqrt(target * aspect), short = sqrt(target / aspect)
  let long = roundToMultipleOf(Math.sqrt(areaTarget * aspect), multipleOf);
  let short = roundToMultipleOf(Math.sqrt(areaTarget / aspect), multipleOf);

  // Rounding can drift the area slightly; nudge the long side (largest effect
  // per step) back into the band. Targets sit mid-band, so this rarely runs.
  let area = long * short;
  if (area < areaMin && short > 0) {
    long += Math.ceil((areaMin - area) / (short * multipleOf)) * multipleOf;
  } else if (area > areaMax && short > 0) {
    long -= Math.ceil((area - areaMax) / (short * multipleOf)) * multipleOf;
  }

  return landscape
    ? { width: long, height: short }
    : { width: short, height: long };
}