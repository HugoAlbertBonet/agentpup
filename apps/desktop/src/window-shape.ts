import type { Rectangle, Size } from "./window-policy.js";

const maximumRectangles = 8;

export function normalizeWindowShape(value: unknown, bounds: Size): Rectangle[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumRectangles) {
    throw new Error("Invalid overlay window shape");
  }

  return value.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      throw new Error("Invalid overlay window shape");
    }
    const rectangle = candidate as Record<string, unknown>;
    const values = [rectangle.x, rectangle.y, rectangle.width, rectangle.height];
    if (!values.every((part) => typeof part === "number" && Number.isInteger(part))) {
      throw new Error("Invalid overlay window shape");
    }
    const result = rectangle as unknown as Rectangle;
    if (
      result.x < 0 ||
      result.y < 0 ||
      result.width <= 0 ||
      result.height <= 0 ||
      result.x + result.width > bounds.width ||
      result.y + result.height > bounds.height
    ) {
      throw new Error("Invalid overlay window shape");
    }
    return {
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height
    };
  });
}
