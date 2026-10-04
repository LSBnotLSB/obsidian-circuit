export type ComponentType =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'dc_source'
  | 'ac_source'
  | 'diode'
  | 'ground';

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label?: string;
  value?: string;
  x: number;
  y: number;
  rotation?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CircuitConnection {
  from: string;
  to: string;
  color?: string;
  waypoints?: Point[];
}

export interface CircuitData {
  width?: number;
  height?: number;
  grid?: boolean;
  components?: CircuitComponent[];
  connections?: CircuitConnection[];
}

export type EditorTool = 'select' | ComponentType;

export interface PinInfo {
  pinId: string;
  componentId: string;
  name: string;
  point: Point;
}