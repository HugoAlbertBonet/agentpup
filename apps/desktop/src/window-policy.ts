export type OverlayRuntime = "native" | "wslg";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface OverlayWindowPolicy {
  focusable: boolean;
  skipTaskbar: boolean;
  windowType: "notification" | undefined;
}

export interface Point {
  x: number;
  y: number;
}

export interface DisplayWorkArea {
  id: number;
  workArea: Rectangle;
}

export type OverlayCorner = "top-left" | "top-right" | "bottom-right" | "bottom-left";

const cornerOrder: readonly OverlayCorner[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left"
];

export function getOverlayWindowPolicy(runtime: OverlayRuntime): OverlayWindowPolicy {
  return runtime === "wslg"
    ? { focusable: true, skipTaskbar: true, windowType: "notification" }
    : { focusable: false, skipTaskbar: true, windowType: undefined };
}

export function getOverlayPosition(
  workArea: Rectangle,
  windowSize: Size,
  runtime: OverlayRuntime,
  margin: number
): { x: number; y: number } {
  return getCornerPosition(
    workArea,
    windowSize,
    runtime === "wslg" ? "top-right" : "bottom-right",
    margin
  );
}

export function getCornerPosition(
  workArea: Rectangle,
  windowSize: Size,
  corner: OverlayCorner,
  margin: number
): Point {
  const axisPosition = (
    origin: number,
    extent: number,
    windowExtent: number,
    atStart: boolean
  ): number => {
    const maximum = origin + extent - windowExtent;
    if (maximum <= origin) return origin;
    const requested = atStart ? origin + margin : maximum - margin;
    return Math.max(origin, Math.min(maximum, requested));
  };
  return {
    x: axisPosition(
      workArea.x,
      workArea.width,
      windowSize.width,
      corner.endsWith("left")
    ),
    y: axisPosition(
      workArea.y,
      workArea.height,
      windowSize.height,
      corner.startsWith("top")
    )
  };
}

function intersectionArea(left: Rectangle, right: Rectangle): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
  );
  return width * height;
}

function distanceSquaredToRectangle(point: Point, rectangle: Rectangle): number {
  const right = rectangle.x + rectangle.width;
  const bottom = rectangle.y + rectangle.height;
  const dx =
    point.x < rectangle.x ? rectangle.x - point.x : point.x > right ? point.x - right : 0;
  const dy =
    point.y < rectangle.y ? rectangle.y - point.y : point.y > bottom ? point.y - bottom : 0;
  return dx * dx + dy * dy;
}

export function selectDisplayForWindow(
  displays: readonly DisplayWorkArea[],
  windowBounds: Rectangle,
  preferredDisplayId?: number
): DisplayWorkArea | undefined {
  if (preferredDisplayId !== undefined) {
    const preferred = displays.find((display) => display.id === preferredDisplayId);
    if (preferred !== undefined) return preferred;
  }
  if (displays.length === 0) return undefined;

  let bestOverlap: DisplayWorkArea | undefined;
  let overlapArea = 0;
  for (const display of displays) {
    const area = intersectionArea(windowBounds, display.workArea);
    if (area > overlapArea) {
      bestOverlap = display;
      overlapArea = area;
    }
  }
  if (bestOverlap !== undefined) return bestOverlap;

  const center = {
    x: windowBounds.x + windowBounds.width / 2,
    y: windowBounds.y + windowBounds.height / 2
  };
  return [...displays].sort(
    (left, right) =>
      distanceSquaredToRectangle(center, left.workArea) -
      distanceSquaredToRectangle(center, right.workArea)
  )[0];
}

export function getNextCorner(corner: OverlayCorner): OverlayCorner {
  const index = cornerOrder.indexOf(corner);
  return cornerOrder[(index + 1) % cornerOrder.length]!;
}
