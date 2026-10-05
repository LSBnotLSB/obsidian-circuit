export type ComponentType =
  // Passive components
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  // Independent sources
  | 'dc_source'
  | 'ac_source'
  | 'current_source'
  // Dependent (controlled) sources
  | 'vcvs' // Voltage Controlled Voltage Source (diamond with +/-)
  | 'ccvs' // Current Controlled Voltage Source (diamond with +/-)
  | 'vccs' // Voltage Controlled Current Source (diamond with arrow)
  | 'cccs' // Current Controlled Current Source (diamond with arrow)
  // Switches
  | 'switch_open'
  | 'switch_closed'
  | 'switch_spdt'
  // Connection and ground
  | 'ground'
  | 'junction'
  // Text and LaTeX annotation
  | 'text';

export type SignConvention = 'none' | 'passive' | 'active';

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label?: string;
  value?: string;
  x: number;
  y: number;
  rotation?: number;
  convention?: SignConvention;
  currentLabel?: string;
  voltageLabel?: string;
  controlFormula?: string;
  text?: string;
  fontSize?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CircuitConnection {
  from: string;
  to: string;
  color?: string;
  current?: string;
  currentDirection?: 'forward' | 'backward';
  label?: string;
  waypoints?: Point[];
}

export interface CircuitLoop {
  id: string;
  label: string;
  value?: string;
  x: number;
  y: number;
  radius?: number;
  direction?: 'cw' | 'ccw';
}

export interface CircuitData {
  width?: number;
  height?: number;
  viewBox?: string;
  panX?: number;
  panY?: number;
  zoom?: number;
  grid?: boolean;
  components?: CircuitComponent[];
  connections?: CircuitConnection[];
  loops?: CircuitLoop[];
}

export type EditorTool = 'select' | 'loop' | ComponentType;

export type SelectionType = 'none' | 'component' | 'connection' | 'loop';

export interface PinInfo {
  pinId: string;
  componentId: string;
  name: string;
  point: Point;
}