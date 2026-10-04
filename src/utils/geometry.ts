import { CircuitComponent, PinInfo, Point } from '../types';

export function snapToGrid(val: number, step = 20): number {
  return Math.round(val / step) * step;
}

export function rotateRelativePoint(lx: number, ly: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(lx * Math.cos(rad) - ly * Math.sin(rad)),
    y: Math.round(lx * Math.sin(rad) + ly * Math.cos(rad)),
  };
}

export function getComponentPins(comp: CircuitComponent): PinInfo[] {
  const rot = comp.rotation || 0;

  if (comp.type === 'ground') {
    const rel = rotateRelativePoint(0, -20, rot);
    return [
      {
        pinId: `${comp.id}.in`,
        componentId: comp.id,
        name: 'in',
        point: { x: comp.x + rel.x, y: comp.y + rel.y },
      },
    ];
  }

  const p1Rel = rotateRelativePoint(-30, 0, rot);
  const p2Rel = rotateRelativePoint(30, 0, rot);

  return [
    {
      pinId: `${comp.id}.p1`,
      componentId: comp.id,
      name: 'p1',
      point: { x: comp.x + p1Rel.x, y: comp.y + p1Rel.y },
    },
    {
      pinId: `${comp.id}.p2`,
      componentId: comp.id,
      name: 'p2',
      point: { x: comp.x + p2Rel.x, y: comp.y + p2Rel.y },
    },
  ];
}

export function buildPinMap(components: CircuitComponent[]): Map<string, Point> {
  const map = new Map<string, Point>();
  for (const comp of components) {
    const pins = getComponentPins(comp);
    for (const pin of pins) {
      map.set(pin.pinId, pin.point);
    }
    // Also allow connecting directly to the component ID
    if (pins.length > 0) {
      map.set(comp.id, comp.type === 'ground' ? pins[0].point : { x: comp.x, y: comp.y });
    }
  }
  return map;
}

export function generateWirePath(
  p1: Point,
  p2: Point,
  fromComp?: CircuitComponent,
  waypoints?: Point[]
): string {
  // Priority 1: Explicit waypoints
  if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
    let d = `M ${p1.x} ${p1.y}`;
    for (const pt of waypoints) {
      d += ` L ${pt.x} ${pt.y}`;
    }
    d += ` L ${p2.x} ${p2.y}`;
    return d;
  }

  // Priority 2: Direct line if aligned
  if (p1.x === p2.x || p1.y === p2.y) {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }

  // Priority 3: Orthogonal L-shape based on source component orientation
  const rot = fromComp ? fromComp.rotation || 0 : 0;
  const isVertical = rot === 90 || rot === 270;

  if (isVertical) {
    return `M ${p1.x} ${p1.y} L ${p1.x} ${p2.y} L ${p2.x} ${p2.y}`;
  } else {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }
}
