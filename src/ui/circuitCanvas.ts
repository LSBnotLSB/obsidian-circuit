import { CircuitComponent, CircuitData, ComponentType, EditorTool, PinInfo, Point } from '../types';
import { drawComponentSymbol } from '../utils/drawSymbols';
import { buildPinMap, generateWirePath, getComponentPins, snapToGrid } from '../utils/geometry';

export interface CanvasCallbacks {
  onSelectionChange: (hasSelection: boolean) => void;
  onEditComponent: (comp: CircuitComponent) => void;
  onDataChange: () => void;
}

export class CircuitCanvas {
  private containerEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private data: CircuitData;
  private callbacks: CanvasCallbacks;

  // Interaction State
  private activeTool: EditorTool = 'select';
  private selectedComponentId: string | null = null;
  private selectedConnectionIndex: number | null = null;
  private wiringSourcePin: PinInfo | null = null;
  private isDragging = false;
  private dragOffset: Point = { x: 0, y: 0 };
  private mousePos: Point = { x: 0, y: 0 };

  constructor(parentEl: HTMLElement, data: CircuitData, callbacks: CanvasCallbacks) {
    this.containerEl = parentEl.createDiv({ cls: 'circuit-editor-canvas-wrap' });
    this.data = data;
    this.callbacks = callbacks;

    const width = data.width || 600;
    const height = data.height || 400;

    this.svgEl = this.containerEl.createSvg('svg', {
      cls: 'circuit-editor-svg',
      attr: {
        width: String(width),
        height: String(height),
        viewBox: `0 0 ${width} ${height}`,
      },
    });

    this.bindEvents();
    this.render();
  }

  setData(data: CircuitData): void {
    this.data = data;
    this.selectedComponentId = null;
    this.selectedConnectionIndex = null;
    this.wiringSourcePin = null;
    this.callbacks.onSelectionChange(false);
    this.render();
  }

  setTool(tool: EditorTool): void {
    this.activeTool = tool;
    if (tool !== 'select') {
      this.wiringSourcePin = null;
      this.selectedComponentId = null;
      this.selectedConnectionIndex = null;
      this.callbacks.onSelectionChange(false);
    }
    this.render();
  }

  rotateSelected(): void {
    if (!this.selectedComponentId || !this.data.components) return;
    const comp = this.data.components.find((c) => c.id === this.selectedComponentId);
    if (!comp) return;

    comp.rotation = ((comp.rotation || 0) + 90) % 360;
    this.callbacks.onDataChange();
    this.render();
  }

  deleteSelected(): void {
    let changed = false;

    if (this.selectedComponentId && this.data.components) {
      const removedId = this.selectedComponentId;
      this.data.components = this.data.components.filter((c) => c.id !== removedId);

      // Remove connections referencing this component
      if (this.data.connections) {
        this.data.connections = this.data.connections.filter(
          (conn) => !conn.from.startsWith(removedId) && !conn.to.startsWith(removedId)
        );
      }

      this.selectedComponentId = null;
      changed = true;
    } else if (this.selectedConnectionIndex !== null && this.data.connections) {
      this.data.connections.splice(this.selectedConnectionIndex, 1);
      this.selectedConnectionIndex = null;
      changed = true;
    }

    if (changed) {
      this.callbacks.onSelectionChange(false);
      this.callbacks.onDataChange();
      this.render();
    }
  }

  getSelectedComponent(): CircuitComponent | null {
    if (!this.selectedComponentId || !this.data.components) return null;
    return this.data.components.find((c) => c.id === this.selectedComponentId) || null;
  }

  updateComponent(updated: CircuitComponent): void {
    if (!this.data.components) return;
    const idx = this.data.components.findIndex((c) => c.id === this.selectedComponentId);
    if (idx !== -1) {
      const oldId = this.data.components[idx].id;
      this.data.components[idx] = updated;

      // Update connection IDs if component ID changed
      if (oldId !== updated.id && this.data.connections) {
        for (const conn of this.data.connections) {
          if (conn.from.startsWith(oldId)) {
            conn.from = conn.from.replace(oldId, updated.id);
          }
          if (conn.to.startsWith(oldId)) {
            conn.to = conn.to.replace(oldId, updated.id);
          }
        }
      }

      this.selectedComponentId = updated.id;
      this.callbacks.onDataChange();
      this.render();
    }
  }

  render(): void {
    this.svgEl.empty();

    // 1. Grid pattern
    if (this.data.grid !== false) {
      const defs = this.svgEl.createSvg('defs');
      const pattern = defs.createSvg('pattern', {
        attr: {
          id: 'editor-circuit-grid',
          width: '20',
          height: '20',
          patternUnits: 'userSpaceOnUse',
        },
      });
      pattern.createSvg('circle', {
        attr: {
          cx: '2',
          cy: '2',
          r: '1.2',
          fill: 'var(--text-faint)',
          opacity: '0.45',
        },
      });
      this.svgEl.createSvg('rect', {
        attr: {
          width: '100%',
          height: '100%',
          fill: 'url(#editor-circuit-grid)',
        },
      });
    }

    const pinCoords = buildPinMap(this.data.components || []);

    // 2. Existing Connections
    if (Array.isArray(this.data.connections)) {
      this.data.connections.forEach((conn, idx) => {
        const p1 = pinCoords.get(conn.from);
        const p2 = pinCoords.get(conn.to);
        if (!p1 || !p2) return;

        const fromComp = this.data.components?.find((c) => conn.from.startsWith(c.id));
        const d = generateWirePath(p1, p2, fromComp, conn.waypoints);
        const isSelected = this.selectedConnectionIndex === idx;

        // Background hit-area for easier clicking
        const hitPath = this.svgEl.createSvg('path', {
          attr: {
            d,
            stroke: 'transparent',
            'stroke-width': '14',
            fill: 'none',
            style: 'cursor: pointer;',
          },
        });
        hitPath.onclick = (e) => {
          e.stopPropagation();
          this.selectedConnectionIndex = idx;
          this.selectedComponentId = null;
          this.wiringSourcePin = null;
          this.callbacks.onSelectionChange(true);
          this.render();
        };

        // Visible wire
        this.svgEl.createSvg('path', {
          attr: {
            d,
            stroke: isSelected ? 'var(--text-accent)' : conn.color || 'var(--text-accent)',
            'stroke-width': isSelected ? '3.5' : '2',
            fill: 'none',
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
            style: 'pointer-events: none;',
          },
        });

        // Junction terminals
        for (const p of [p1, p2]) {
          this.svgEl.createSvg('circle', {
            attr: {
              cx: String(p.x),
              cy: String(p.y),
              r: isSelected ? '4' : '3',
              fill: 'var(--text-accent)',
              style: 'pointer-events: none;',
            },
          });
        }
      });
    }

    // 3. Components
    if (Array.isArray(this.data.components)) {
      for (const comp of this.data.components) {
        const isSelected = this.selectedComponentId === comp.id;
        const rot = comp.rotation || 0;

        const compG = this.svgEl.createSvg('g', {
          cls: `circuit-comp-group ${isSelected ? 'is-selected' : ''}`,
          attr: {
            transform: `translate(${comp.x}, ${comp.y}) rotate(${rot})`,
            stroke: isSelected ? 'var(--text-accent)' : 'var(--text-normal)',
            'stroke-width': '2',
            fill: 'none',
            style: 'cursor: grab;',
          },
        });

        // Component hit-rect
        compG.createSvg('rect', {
          attr: {
            x: '-35',
            y: '-25',
            width: '70',
            height: '50',
            fill: 'transparent',
            stroke: isSelected ? 'var(--text-accent)' : 'none',
            'stroke-width': '1',
            'stroke-dasharray': isSelected ? '4 2' : 'none',
            rx: '4',
          },
        });

        drawComponentSymbol(compG, comp, true);

        // Component interaction
        compG.onmousedown = (e) => {
          if (this.activeTool !== 'select' || e.button !== 0) return;
          e.stopPropagation();

          this.selectedComponentId = comp.id;
          this.selectedConnectionIndex = null;
          this.wiringSourcePin = null;
          this.isDragging = true;
          this.dragOffset = {
            x: this.mousePos.x - comp.x,
            y: this.mousePos.y - comp.y,
          };
          this.callbacks.onSelectionChange(true);
          this.render();
        };

        compG.ondblclick = (e) => {
          e.stopPropagation();
          this.callbacks.onEditComponent(comp);
        };

        // Pin Hotspots
        const pins = getComponentPins(comp);
        for (const pin of pins) {
          const isWiringSource = this.wiringSourcePin?.pinId === pin.pinId;

          const pinCircle = this.svgEl.createSvg('circle', {
            cls: 'circuit-pin-target',
            attr: {
              cx: String(pin.point.x),
              cy: String(pin.point.y),
              r: isWiringSource ? '6' : '4.5',
              fill: isWiringSource ? 'var(--interactive-accent)' : 'var(--text-accent)',
              stroke: 'var(--background-primary)',
              'stroke-width': '1.5',
              style: 'cursor: crosshair;',
            },
          });

          pinCircle.onmouseenter = () => {
            pinCircle.setAttribute('r', '7');
          };
          pinCircle.onmouseleave = () => {
            if (this.wiringSourcePin?.pinId !== pin.pinId) {
              pinCircle.setAttribute('r', '4.5');
            }
          };

          pinCircle.onmousedown = (e) => {
            e.stopPropagation();
            if (this.activeTool !== 'select') return;

            if (!this.wiringSourcePin) {
              // Start wiring
              this.wiringSourcePin = pin;
              this.selectedComponentId = null;
              this.selectedConnectionIndex = null;
              this.callbacks.onSelectionChange(false);
              this.render();
            } else if (this.wiringSourcePin.pinId !== pin.pinId) {
              // Complete wiring
              if (!this.data.connections) {
                this.data.connections = [];
              }
              this.data.connections.push({
                from: this.wiringSourcePin.pinId,
                to: pin.pinId,
              });
              this.wiringSourcePin = null;
              this.callbacks.onDataChange();
              this.render();
            }
          };
        }
      }
    }

    // 4. Ghost wire in progress
    if (this.wiringSourcePin) {
      const fromP = this.wiringSourcePin.point;
      const toP = { x: snapToGrid(this.mousePos.x), y: snapToGrid(this.mousePos.y) };
      const fromComp = this.data.components?.find((c) =>
        this.wiringSourcePin ? this.wiringSourcePin.componentId === c.id : false
      );
      const d = generateWirePath(fromP, toP, fromComp);

      this.svgEl.createSvg('path', {
        cls: 'circuit-ghost-wire',
        attr: {
          d,
          stroke: 'var(--text-accent)',
          'stroke-width': '2',
          'stroke-dasharray': '5 3',
          fill: 'none',
          style: 'pointer-events: none;',
        },
      });
    }

    // 5. Ghost component preview for placement
    if (this.activeTool !== 'select') {
      const snapX = snapToGrid(this.mousePos.x);
      const snapY = snapToGrid(this.mousePos.y);

      const ghostG = this.svgEl.createSvg('g', {
        cls: 'circuit-ghost-comp',
        attr: {
          transform: `translate(${snapX}, ${snapY})`,
          stroke: 'var(--text-accent)',
          'stroke-width': '2',
          opacity: '0.6',
          fill: 'none',
          style: 'pointer-events: none;',
        },
      });

      drawComponentSymbol(ghostG, { type: this.activeTool }, false);
    }
  }

  private bindEvents(): void {
    this.svgEl.onmousemove = (e) => {
      this.mousePos = this.getSvgCoordinates(e);

      if (this.isDragging && this.selectedComponentId && this.data.components) {
        const comp = this.data.components.find((c) => c.id === this.selectedComponentId);
        if (comp) {
          comp.x = snapToGrid(this.mousePos.x - this.dragOffset.x);
          comp.y = snapToGrid(this.mousePos.y - this.dragOffset.y);
          this.render();
        }
      } else if (this.wiringSourcePin || this.activeTool !== 'select') {
        this.render();
      }
    };

    this.svgEl.onmouseup = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.callbacks.onDataChange();
        this.render();
      }
    };

    this.svgEl.onclick = (e) => {
      // Place new component
      if (this.activeTool !== 'select') {
        const pt = this.getSvgCoordinates(e);
        this.addComponent(this.activeTool, snapToGrid(pt.x), snapToGrid(pt.y));
        this.activeTool = 'select';
        this.render();
        return;
      }

      // Clicking empty background deselects and cancels active wiring
      this.selectedComponentId = null;
      this.selectedConnectionIndex = null;
      this.wiringSourcePin = null;
      this.callbacks.onSelectionChange(false);
      this.render();
    };
  }

  private addComponent(type: ComponentType, x: number, y: number): void {
    if (!this.data.components) {
      this.data.components = [];
    }

    const id = this.generateNextId(type);
    const newComp: CircuitComponent = {
      id,
      type,
      x,
      y,
      rotation: 0,
      label: id,
      value: this.getDefaultValue(type),
    };

    this.data.components.push(newComp);
    this.selectedComponentId = id;
    this.callbacks.onSelectionChange(true);
    this.callbacks.onDataChange();
  }

  private generateNextId(type: ComponentType): string {
    const prefixMap: Record<ComponentType, string> = {
      resistor: 'R',
      capacitor: 'C',
      inductor: 'L',
      dc_source: 'V',
      ac_source: 'VAC',
      diode: 'D',
      ground: 'GND',
    };

    const prefix = prefixMap[type] || 'COMP';
    const existing = this.data.components || [];
    let count = 1;
    while (existing.some((c) => c.id === `${prefix}${count}`)) {
      count++;
    }
    return `${prefix}${count}`;
  }

  private getDefaultValue(type: ComponentType): string | undefined {
    switch (type) {
      case 'resistor':
        return '1kΩ';
      case 'capacitor':
        return '100nF';
      case 'inductor':
        return '10mH';
      case 'dc_source':
        return '12V';
      case 'ac_source':
        return '230V';
      case 'ground':
        return undefined;
      case 'diode':
        return undefined;
    }
  }

  private getSvgCoordinates(evt: MouseEvent): Point {
    const pt = this.svgEl.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = this.svgEl.getScreenCTM();
    if (ctm) {
      const transformed = pt.matrixTransform(ctm.inverse());
      return {
        x: Math.round(transformed.x),
        y: Math.round(transformed.y),
      };
    }
    const rect = this.svgEl.getBoundingClientRect();
    return {
      x: Math.round(evt.clientX - rect.left),
      y: Math.round(evt.clientY - rect.top),
    };
  }
}
