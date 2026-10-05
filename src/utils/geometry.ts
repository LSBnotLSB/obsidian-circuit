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

  if (comp.type === 'text') {
    return [];
  }

  if (comp.type === 'junction') {
    return [
      {
        pinId: `${comp.id}.j`,
        componentId: comp.id,
        name: 'j',
        point: { x: comp.x, y: comp.y },
      },
    ];
  }

  if (comp.type === 'switch_spdt') {
    const pIn = rotateRelativePoint(-30, 0, rot);
    const pOut1 = rotateRelativePoint(30, -12, rot);
    const pOut2 = rotateRelativePoint(30, 12, rot);
    return [
      {
        pinId: `${comp.id}.in`,
        componentId: comp.id,
        name: 'in',
        point: { x: comp.x + pIn.x, y: comp.y + pIn.y },
      },
      {
        pinId: `${comp.id}.out1`,
        componentId: comp.id,
        name: 'out1',
        point: { x: comp.x + pOut1.x, y: comp.y + pOut1.y },
      },
      {
        pinId: `${comp.id}.out2`,
        componentId: comp.id,
        name: 'out2',
        point: { x: comp.x + pOut2.x, y: comp.y + pOut2.y },
      },
    ];
  }

  // Standard 2-pin components (resistor, capacitor, inductor, sources, diode, switches)
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
      map.set(
        comp.id,
        comp.type === 'ground' || comp.type === 'junction' ? pins[0].point : { x: comp.x, y: comp.y }
      );
    }
  }
  return map;
}

export function getWirePoints(
  p1: Point,
  p2: Point,
  fromComp?: CircuitComponent,
  waypoints?: Point[]
): Point[] {
  if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
    return [p1, ...waypoints, p2];
  }

  if (p1.x === p2.x || p1.y === p2.y) {
    return [p1, p2];
  }

  const rot = fromComp ? fromComp.rotation || 0 : 0;
  const isVertical = rot === 90 || rot === 270;

  if (isVertical) {
    return [p1, { x: p1.x, y: p2.y }, p2];
  } else {
    return [p1, { x: p2.x, y: p1.y }, p2];
  }
}

export function generateWirePath(
  p1: Point,
  p2: Point,
  fromComp?: CircuitComponent,
  waypoints?: Point[]
): string {
  const pts = getWirePoints(p1, p2, fromComp, waypoints);
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export function pointToSegmentDistance(
  p: Point,
  a: Point,
  b: Point
): { distance: number; projection: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return {
      distance: Math.hypot(p.x - a.x, p.y - a.y),
      projection: { x: a.x, y: a.y },
    };
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const proj = {
    x: Math.round(a.x + t * dx),
    y: Math.round(a.y + t * dy),
  };

  return {
    distance: Math.hypot(p.x - proj.x, p.y - proj.y),
    projection: proj,
  };
}

export function getClosestPointOnWire(
  point: Point,
  p1: Point,
  p2: Point,
  fromComp?: CircuitComponent,
  waypoints?: Point[]
): { point: Point; distance: number } {
  const pts = getWirePoints(p1, p2, fromComp, waypoints);
  let bestDist = Infinity;
  let bestPoint: Point = pts[0];

  for (let i = 0; i < pts.length - 1; i++) {
    const res = pointToSegmentDistance(point, pts[i], pts[i + 1]);
    if (res.distance < bestDist) {
      bestDist = res.distance;
      bestPoint = res.projection;
    }
  }

  return { point: bestPoint, distance: bestDist };
}
