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

export function areImageEditDimensionsValid(
  width: number,
  height: number,
  model: ImageEditModel,
) {
  const spec = IMAGE_EDIT_MODEL_SPEC[model].dimensions;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width % spec.multipleOf !== 0 ||
    height % spec.multipleOf !== 0
  ) {
    return false;
  }

  const aspect = width / height;
  if (aspect < spec.aspectMin || aspect > spec.aspectMax) return false;

  if (spec.strategy === "flux") {
    return width >= 256 && height >= 256 && width <= 1024 && height <= 1024;
  }

  const area = width * height;
  return area >= (spec.areaMin ?? 0) && area <= (spec.areaMax ?? Infinity);
}

const roundToMultipleOf = (value: number, multiple: number) =>
  Math.round(value / multiple) * multiple;

/**
 * Original FLUX.2 scaling, preserved byte-for-byte so the existing FLUX path is
 * unchanged for ordinary images: longest side capped at 1024 and both sides
 * rounded to multiples of 16. Together now rejects sides below 256, so extreme
 * source aspect ratios are clamped to the representable 1:4–4:1 range.
 */
function fluxAdjust(width: number, height: number) {
  const maxDim = 1024;
  const minDim = 256;
  const landscape = width >= height;
  const long0 = Math.max(width, height);
  const short0 = Math.min(width, height);
  const rawAspect =
    Number.isFinite(long0 / short0) && short0 > 0 ? long0 / short0 : 1;
  const aspect = Math.min(4, Math.max(1, rawAspect));

  let long = Math.min(maxDim, Math.max(minDim, long0));
  let short = long / aspect;

  if (short < minDim) {
    short = minDim;
    long = short * aspect;
  }

  long = Math.min(maxDim, Math.max(minDim, roundToMultipleOf(long, 16)));
  short = Math.min(maxDim, Math.max(minDim, roundToMultipleOf(short, 16)));

  return landscape
    ? { width: long, height: short }
    : { width: short, height: long };
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
