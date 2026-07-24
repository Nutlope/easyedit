import assert from "node:assert/strict";
import test from "node:test";
import {
  areImageEditDimensionsValid,
  getAdjustedDimensions,
} from "./get-adjusted-dimentions";

const FLUX_MODEL = "black-forest-labs/FLUX.2-flex" as const;

test("keeps FLUX dimensions inside the live provider domain", () => {
  for (const [width, height] of [
    [502, 78],
    [237, 419],
    [1, 1],
    [100_000, 1],
    [1, 100_000],
    [896, 896],
    [986, 1752],
  ]) {
    const adjusted = getAdjustedDimensions(width, height, FLUX_MODEL);

    assert.equal(
      areImageEditDimensionsValid(adjusted.width, adjusted.height, FLUX_MODEL),
      true,
      `${width}x${height} produced invalid dimensions`,
    );
  }
});

test("preserves dimensions that are already valid", () => {
  assert.deepEqual(getAdjustedDimensions(896, 896, FLUX_MODEL), {
    width: 896,
    height: 896,
  });
  assert.deepEqual(getAdjustedDimensions(1024, 576, FLUX_MODEL), {
    width: 1024,
    height: 576,
  });
});

test("produces valid Seedream dimensions across extreme aspect ratios", () => {
  for (const [width, height] of [
    [1, 1],
    [100_000, 1],
    [1, 100_000],
    [3472, 4624],
  ]) {
    const adjusted = getAdjustedDimensions(
      width,
      height,
      "ByteDance/Seedream-5.0-lite",
    );
    const area = adjusted.width * adjusted.height;

    assert.ok(area >= 3_686_400);
    assert.ok(area <= 10_404_496);
    assert.equal(adjusted.width % 8, 0);
    assert.equal(adjusted.height % 8, 0);
  }
});
