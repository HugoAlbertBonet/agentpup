import type { Point, Rectangle, Size } from "./window-policy.js";

export function isRoamingEnabled(arguments_: readonly string[]): boolean {
  return arguments_.includes("--roam");
}

export function advanceMotion(current: Point, target: Point, maximumStep: number): Point {
  const deltaX = target.x - current.x;
  const deltaY = target.y - current.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0 || distance <= maximumStep) return { ...target };
  const scale = maximumStep / distance;
  return {
    x: current.x + deltaX * scale,
    y: current.y + deltaY * scale
  };
}

export function chooseEdgeTarget(
  workArea: Rectangle,
  windowSize: Size,
  margin: number,
  edgeValue: number,
  positionValue: number
): Point {
  const minimumX = workArea.x + margin;
  const maximumX = workArea.x + Math.max(margin, workArea.width - windowSize.width - margin);
  const minimumY = workArea.y + margin;
  const maximumY = workArea.y + Math.max(margin, workArea.height - windowSize.height - margin);
  const safeMaximumY = minimumY + (maximumY - minimumY) * 0.55;
  const x = minimumX + (maximumX - minimumX) * positionValue;
  const y = minimumY + (safeMaximumY - minimumY) * positionValue;

  switch (Math.min(2, Math.floor(edgeValue * 3))) {
    case 0:
      return { x: Math.round(x), y: minimumY };
    case 1:
      return { x: maximumX, y: Math.round(y) };
    default:
      return { x: minimumX, y: Math.round(y) };
  }
}

export function clampToWorkArea(
  position: Point,
  workArea: Rectangle,
  windowSize: Size,
  margin: number
): Point {
  const minimumX = workArea.x + margin;
  const minimumY = workArea.y + margin;
  const maximumX = workArea.x + Math.max(margin, workArea.width - windowSize.width - margin);
  const maximumY = workArea.y + Math.max(margin, workArea.height - windowSize.height - margin);
  return {
    x: Math.round(Math.min(Math.max(position.x, minimumX), maximumX)),
    y: Math.round(Math.min(Math.max(position.y, minimumY), maximumY))
  };
}
