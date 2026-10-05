import { App, Component, Menu, Notice, finishRenderMath, renderMath, setIcon } from 'obsidian';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { LRLanguage } from '@codemirror/language';
import {
  CircuitComponent,
  CircuitConnection,
  CircuitData,
  CircuitLoop,
  ComponentType,
  EditorTool,
  PinInfo,
  Point,
  SelectionType,
} from '../types';
import { drawComponentSymbol, drawLoopSymbol } from '../utils/drawSymbols';
import {
  buildPinMap,
  generateWirePath,
  getClosestPointOnWire,
  getComponentPins,
  getWirePoints,
  snapToGrid,
} from '../utils/geometry';

export interface CanvasCallbacks {
  onSelectionChange: (type: SelectionType) => void;
  onToolChange?: (tool: EditorTool) => void;
  onEditComponent: (comp: CircuitComponent) => void;
  onEditConnection?: (conn: CircuitConnection) => void;
  onEditLoop?: (loop: CircuitLoop) => void;
  onDataChange: () => void;
}

const LATEX_CONCEAL_SYMBOLS: Record<string, string> = {
  // Greek lowercase
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',

  // Greek uppercase
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',

  // Math operators & calculus
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  partial: '∂',
  nabla: '∇',
  infty: '∞',
  sqrt: '√',

  // Relations & comparison
  approx: '≈',
  sim: '∼',
  neq: '≠',
  ne: '≠',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ll: '≪',
  gg: '≫',
  equiv: '≡',
  propto: '∝',

  // Binary operators
  times: '×',
  cdot: '·',
  pm: '±',
  mp: '∓',
  div: '÷',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '•',
  oplus: '⊕',
  otimes: '⊗',

  // Arrows
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  Leftrightarrow: '⇔',
  uparrow: '↑',
  downarrow: '↓',
  mapsto: '↦',

  // Logic & Set theory
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  land: '∧',
  lor: '∨',
  neg: '¬',
  emptyset: '∅',

  // Physics & Engineering units
  ohm: 'Ω',
  micro: 'µ',
  degree: '°',
  angstrom: 'Å',
};

class SymbolWidget extends WidgetType {
  constructor(readonly symbol: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = createSpan({ cls: 'circuit-live-symbol cm-math', text: this.symbol });
    return span;
  }

  eq(other: SymbolWidget): boolean {
    return this.symbol === other.symbol;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly math: string,
    readonly isBlock: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const span = this.isBlock
      ? createDiv({ cls: 'circuit-live-math-block' })
      : createSpan({ cls: 'circuit-live-math-inline' });
    try {
      const rendered = renderMath(this.math, this.isBlock);
      span.appendChild(rendered);
      void finishRenderMath();
    } catch {
      span.textContent = this.isBlock ? `$$${this.math}$$` : `$${this.math}$`;
    }

    // Clicking the rendered formula positions cursor inside it so user can edit right away
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: Math.min(this.from + 1, this.to) },
      });
      view.focus();
    });

    return span;
  }

  eq(other: MathWidget): boolean {
    return (
      this.math === other.math &&
      this.isBlock === other.isBlock &&
      this.from === other.from &&
      this.to === other.to
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function createLivePreviewPlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.computeDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = this.computeDecorations(update.view);
        }
      }

      computeDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const text = doc.toString();
        const selection = view.state.selection;

        // Strictly inside: cursor extends strictly past from and strictly before to
        const isCursorInside = (from: number, to: number): boolean => {
          for (const range of selection.ranges) {
            if (range.from < to && range.to > from) {
              return true;
            }
          }
          return false;
        };

        const isCursorOver = (from: number, to: number): boolean => {
          for (const range of selection.ranges) {
            if (range.from <= to && range.to >= from) {
              return true;
            }
          }
          return false;
        };

        interface DecoItem {
          from: number;
          to: number;
          deco: Decoration;
        }
        const items: DecoItem[] = [];
        const coveredRanges: Array<{ from: number; to: number }> = [];

        // 1. Block math: $$ ... $$
        const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
        let match: RegExpExecArray | null;
        while ((match = blockMathRegex.exec(text)) !== null) {
          const from = match.index;
          const to = from + match[0].length;
          coveredRanges.push({ from, to });
          if (!isCursorInside(from, to)) {
            const mathContent = match[1].trim();
            items.push({
              from,
              to,
              deco: Decoration.replace({
                widget: new MathWidget(mathContent, true, from, to),
              }),
            });
          }
        }

        // 2. Inline math: $ ... $
        const inlineMathRegex = /\$([^$\n]+?)\$/g;
        while ((match = inlineMathRegex.exec(text)) !== null) {
          const from = match.index;
          const to = from + match[0].length;
          const isCovered = coveredRanges.some((r) => from >= r.from && to <= r.to);
          if (isCovered) continue;
          coveredRanges.push({ from, to });

          if (!isCursorInside(from, to)) {
            const mathContent = match[1].trim();
            items.push({
              from,
              to,
              deco: Decoration.replace({
                widget: new MathWidget(mathContent, false, from, to),
              }),
            });
          }
        }

        // 3. LaTeX Symbol Conceal inside active math formulas (e.g. \sum -> ∑, \alpha -> α)
        for (const r of coveredRanges) {
          if (isCursorInside(r.from, r.to)) {
            const cmdRegex = /\\([a-zA-Z]+)/g;
            const subText = text.slice(r.from, r.to);
            let cmdMatch: RegExpExecArray | null;
            while ((cmdMatch = cmdRegex.exec(subText)) !== null) {
              const cmdName = cmdMatch[1];
              const symbolChar = LATEX_CONCEAL_SYMBOLS[cmdName];
              if (symbolChar) {
                const cmdFrom = r.from + cmdMatch.index;
                const cmdTo = cmdFrom + cmdMatch[0].length;
                if (!isCursorOver(cmdFrom, cmdTo)) {
                  items.push({
                    from: cmdFrom,
                    to: cmdTo,
                    deco: Decoration.replace({
                      widget: new SymbolWidget(symbolChar),
                    }),
                  });
                }
              }
            }
          }
        }

        // 4. Bold: **text**
        const boldRegex = /\*\*([^*\n]+?)\*\*/g;
        while ((match = boldRegex.exec(text)) !== null) {
          const from = match.index;
          const to = from + match[0].length;
          const isCovered = coveredRanges.some((r) => (from >= r.from && from < r.to) || (to > r.from && to <= r.to));
          if (isCovered) continue;

          items.push({
            from,
            to,
            deco: Decoration.mark({ class: 'cm-strong' }),
          });
        }

        // 5. Italic: *text*
        const italicRegex = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g;
        while ((match = italicRegex.exec(text)) !== null) {
          const from = match.index;
          const to = from + match[0].length;
          const isCovered = coveredRanges.some((r) => (from >= r.from && from < r.to) || (to > r.from && to <= r.to));
          if (isCovered) continue;

          items.push({
            from,
            to,
            deco: Decoration.mark({ class: 'cm-em' }),
          });
        }

        items.sort((a, b) => a.from - b.from || a.to - b.to);

        let lastEnd = -1;
        for (const item of items) {
          if (item.from >= lastEnd) {
            builder.add(item.from, item.to, item.deco);
            lastEnd = item.to;
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

export class CircuitCanvas {
  private containerEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private data: CircuitData;
  private callbacks: CanvasCallbacks;

  // Camera & Infinite Canvas Navigation (Pan & Zoom)
  private pan: Point = { x: 0, y: 0 };
  private zoom = 1.0;
  private isPanning = false;
  private isSpacePressed = false;
  private panStartClient: Point = { x: 0, y: 0 };
  private panOrigin: Point = { x: 0, y: 0 };
  private viewportG: SVGGElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private zoomLabelEl: HTMLElement | null = null;

  // Interaction State
  private activeTool: EditorTool = 'select';
  private ghostRotation = 0;
  private selectedComponentId: string | null = null;
  private selectedConnectionIndex: number | null = null;
  private selectedLoopId: string | null = null;

  private wiringSourcePin: PinInfo | null = null;
  private hoveredPinId: string | null = null;
  private isWiring = false;
  private isDragging = false;
  private isPointerDown = false;
  private movingComponentId: string | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private pointerDownPos: Point = { x: 0, y: 0 };
  private mousePos: Point = { x: 0, y: 0 };

  private pendingCompClick: CircuitComponent | null = null;
  private pendingConnIndex: number | null = null;
  private pendingLoopClick: CircuitLoop | null = null;
  private didDragMove = false;
  private app?: App;
  private ownerComponent?: Component;

  // Inline text editing state
  private editingTextComponentId: string | null = null;
  private originalEditingText = '';
  private activeInlineEditor: EditorView | null = null;
  private inlineEditorOverlayEl: HTMLElement | null = null;

  // Window event listeners for pan mode
  private onKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private onWheelHandler: ((e: WheelEvent) => void) | null = null;

  constructor(
    parentEl: HTMLElement,
    data: CircuitData,
    callbacks: CanvasCallbacks,
    app?: App,
    ownerComponent?: Component
  ) {
    this.containerEl = parentEl.createDiv({ cls: 'circuit-editor-canvas-wrap' });
    this.app = app;
    this.ownerComponent = ownerComponent;
    this.data = data;
    if (!this.data.components) this.data.components = [];
    if (!this.data.connections) this.data.connections = [];
    if (!this.data.loops) this.data.loops = [];
    this.callbacks = callbacks;

    this.pan = { x: data.panX ?? 0, y: data.panY ?? 0 };
    this.zoom = data.zoom ?? 1.0;

    this.svgEl = this.containerEl.createSvg('svg', {
      attr: {
        class: 'circuit-editor-svg',
        width: '100%',
        height: '100%',
      },
    });

    this.createCanvasControls();
    this.bindEvents();
    this.render();
  }

  setData(data: CircuitData): void {
    this.data = data;
    if (!this.data.components) this.data.components = [];
    if (!this.data.connections) this.data.connections = [];
    if (!this.data.loops) this.data.loops = [];

    this.pan = { x: data.panX ?? 0, y: data.panY ?? 0 };
    this.zoom = data.zoom ?? 1.0;
    this.isPanning = false;

    this.selectedComponentId = null;
    this.selectedConnectionIndex = null;
    this.selectedLoopId = null;
    if (this.activeInlineEditor) {
      this.activeInlineEditor.destroy();
      this.activeInlineEditor = null;
    }
    this.editingTextComponentId = null;
    this.wiringSourcePin = null;
    this.hoveredPinId = null;
    this.isWiring = false;
    this.isDragging = false;
    this.isPointerDown = false;
    this.movingComponentId = null;
    this.pendingCompClick = null;
    this.pendingConnIndex = null;
    this.pendingLoopClick = null;
    this.didDragMove = false;
    this.callbacks.onSelectionChange('none');
    this.updateViewportTransform();
    this.render();
  }

  setTool(tool: EditorTool): void {
    this.activeTool = tool;
    this.ghostRotation = 0;
    if (tool !== 'select') {
      this.wiringSourcePin = null;
      this.hoveredPinId = null;
      this.selectedComponentId = null;
      this.selectedConnectionIndex = null;
      this.selectedLoopId = null;
      this.isDragging = false;
      this.movingComponentId = null;
      this.callbacks.onSelectionChange('none');
    }
    this.render();
  }

  hasGhostTool(): boolean {
    return this.activeTool !== 'select';
  }

  rotateGhost(): void {
    if (this.activeTool !== 'select') {
      this.ghostRotation = (this.ghostRotation + 90) % 360;
      this.render();
    }
  }

  hasActiveAction(): boolean {
    return (
      this.activeTool !== 'select' ||
      this.editingTextComponentId !== null ||
      this.wiringSourcePin !== null ||
      this.isDragging ||
      this.movingComponentId !== null ||
      this.selectedComponentId !== null ||
      this.selectedConnectionIndex !== null ||
      this.selectedLoopId !== null
    );
  }

  cancelActiveAction(): void {
    if (this.editingTextComponentId) {
      this.cancelInlineTextEdit();
    }
    this.activeTool = 'select';
    this.ghostRotation = 0;
    this.wiringSourcePin = null;
    this.hoveredPinId = null;
    this.selectedComponentId = null;
    this.selectedConnectionIndex = null;
    this.selectedLoopId = null;
    this.isDragging = false;
    this.isPointerDown = false;
    this.movingComponentId = null;
    this.isWiring = false;
    this.pendingCompClick = null;
    this.pendingConnIndex = null;
    this.pendingLoopClick = null;
    this.didDragMove = false;
    this.callbacks.onSelectionChange('none');
    this.callbacks.onToolChange?.('select');
    this.render();
  }

  isEditingText(): boolean {
    return this.editingTextComponentId !== null;
  }

  startInlineTextEdit(comp: CircuitComponent): void {
    if (this.activeInlineEditor) {
      this.finishInlineTextEdit();
    }
    this.originalEditingText = comp.text !== undefined ? comp.text : (comp.label || '');
    this.editingTextComponentId = comp.id;
    this.selectedComponentId = comp.id;
    this.selectedConnectionIndex = null;
    this.selectedLoopId = null;
    this.isDragging = false;
    this.movingComponentId = null;
    this.callbacks.onSelectionChange('component');

    this.render();
    this.createInlineEditorOverlay(comp);
  }

  finishInlineTextEdit(saveValue?: string): void {
    if (!this.editingTextComponentId) return;
    const compId = this.editingTextComponentId;
    this.editingTextComponentId = null;

    let val = saveValue;
    if (val === undefined && this.activeInlineEditor) {
      val = this.activeInlineEditor.state.doc.toString();
    }

    if (this.activeInlineEditor) {
      this.activeInlineEditor.destroy();
      this.activeInlineEditor = null;
    }
    if (this.inlineEditorOverlayEl) {
      this.inlineEditorOverlayEl.remove();
      this.inlineEditorOverlayEl = null;
    }

    if (this.data.components) {
      const comp = this.data.components.find((c) => c.id === compId);
      if (comp && val !== undefined) {
        comp.text = val;
        comp.label = val;
        this.callbacks.onDataChange();
      }
    }
    this.render();
  }

  cancelInlineTextEdit(): void {
    if (!this.editingTextComponentId) return;
    const compId = this.editingTextComponentId;
    this.editingTextComponentId = null;

    if (this.activeInlineEditor) {
      this.activeInlineEditor.destroy();
      this.activeInlineEditor = null;
    }
    if (this.inlineEditorOverlayEl) {
      this.inlineEditorOverlayEl.remove();
      this.inlineEditorOverlayEl = null;
    }

    if (this.data.components) {
      const comp = this.data.components.find((c) => c.id === compId);
      if (comp) {
        comp.text = this.originalEditingText;
        comp.label = this.originalEditingText;
      }
    }
    this.render();
  }

  undoInlineText(): boolean {
    if (this.activeInlineEditor) {
      return undo(this.activeInlineEditor);
    }
    return false;
  }

  redoInlineText(): boolean {
    if (this.activeInlineEditor) {
      return redo(this.activeInlineEditor);
    }
    return false;
  }

  rotateSelected(): void {
    if (this.selectedComponentId && this.data.components) {
      const comp = this.data.components.find((c) => c.id === this.selectedComponentId);
      if (!comp) return;
      comp.rotation = ((comp.rotation || 0) + 90) % 360;
      this.callbacks.onDataChange();
      this.render();
      return;
    }

    if (this.selectedLoopId && this.data.loops) {
      const loop = this.data.loops.find((l) => l.id === this.selectedLoopId);
      if (!loop) return;
      loop.direction = loop.direction === 'ccw' ? 'cw' : 'ccw';
      this.callbacks.onDataChange();
      this.render();
      return;
    }
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
    } else if (this.selectedLoopId && this.data.loops) {
      this.data.loops = this.data.loops.filter((l) => l.id !== this.selectedLoopId);
      this.selectedLoopId = null;
      changed = true;
    }

    if (changed) {
      this.callbacks.onSelectionChange('none');
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

  updateConnection(idx: number, updated: CircuitConnection): void {
    if (!this.data.connections || !this.data.connections[idx]) return;
    this.data.connections[idx] = updated;
    this.callbacks.onDataChange();
    this.render();
  }

  updateLoop(updated: CircuitLoop): void {
    if (!this.data.loops) return;
    const idx = this.data.loops.findIndex((l) => l.id === updated.id);
    if (idx !== -1) {
      this.data.loops[idx] = updated;
      this.callbacks.onDataChange();
      this.render();
    }
  }

  /**
   * Splits an existing connection by inserting a junction node at the given coordinate.
   */
  branchConnection(connIndex: number, clickPos: Point): void {
    if (!this.data.connections || !this.data.connections[connIndex]) return;
    const conn = this.data.connections[connIndex];

    const pinCoords = buildPinMap(this.data.components || []);
    const p1 = pinCoords.get(conn.from);
    const p2 = pinCoords.get(conn.to);
    if (!p1 || !p2) return;

    const fromComp = this.data.components?.find((c) => conn.from.startsWith(c.id));
    const closest = getClosestPointOnWire(clickPos, p1, p2, fromComp, conn.waypoints);

    const jId = this.generateNextId('junction');
    const jComp: CircuitComponent = {
      id: jId,
      type: 'junction',
      x: closest.point.x,
      y: closest.point.y,
      rotation: 0,
      label: jId,
    };

    if (!this.data.components) this.data.components = [];
    this.data.components.push(jComp);

    // Replace old connection with two connections passing through J.j
    const c1: CircuitConnection = {
      from: conn.from,
      to: `${jId}.j`,
      color: conn.color,
    };
    const c2: CircuitConnection = {
      from: `${jId}.j`,
      to: conn.to,
      color: conn.color,
    };

    this.data.connections.splice(connIndex, 1, c1, c2);
    this.selectedComponentId = jId;
    this.selectedConnectionIndex = null;
    this.callbacks.onSelectionChange('component');
    this.callbacks.onDataChange();
    this.render();
  }

  render(): void {
    this.svgEl.empty();

    // 0. Grid pattern in defs
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
    }

    // 1. Root Viewport Group (Hardware accelerated Pan & Zoom)
    const viewportG = this.svgEl.createSvg('g', {
      attr: {
        class: 'circuit-viewport',
        transform: `translate(${this.pan.x}, ${this.pan.y}) scale(${this.zoom})`,
      },
    });
    this.viewportG = viewportG;

    // Infinite Background Grid Rect
    if (this.data.grid !== false) {
      viewportG.createSvg('rect', {
        attr: {
          class: 'circuit-grid-rect',
          x: '-50000',
          y: '-50000',
          width: '100000',
          height: '100000',
          fill: 'url(#editor-circuit-grid)',
          style: 'pointer-events: none;',
        },
      });
    }

    // Infinite Background Drag Rect (for pan navigation on empty space)
    viewportG.createSvg('rect', {
      attr: {
        class: 'circuit-bg-drag',
        x: '-50000',
        y: '-50000',
        width: '100000',
        height: '100000',
        fill: 'transparent',
      },
    });

    const pinCoords = buildPinMap(this.data.components || []);

    // 2. Existing Connections & Wire Current Annotations
    if (Array.isArray(this.data.connections)) {
      this.data.connections.forEach((conn, idx) => {
        const p1 = pinCoords.get(conn.from);
        const p2 = pinCoords.get(conn.to);
        if (!p1 || !p2) return;

        const fromComp = this.data.components?.find((c) => conn.from.startsWith(c.id));
        const d = generateWirePath(p1, p2, fromComp, conn.waypoints);
        const isSelected = this.selectedConnectionIndex === idx;

        // Background hit-area for easier clicking
        const hitPath = viewportG.createSvg('path', {
          attr: {
            d,
            stroke: 'transparent',
            'stroke-width': '14',
            fill: 'none',
            style: 'cursor: pointer;',
            'data-connection-index': String(idx),
          },
        });
        hitPath.setAttribute('pointer-events', 'stroke');

        // Visible wire
        viewportG.createSvg('path', {
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

        // Junction terminals at connection endpoints
        for (const p of [p1, p2]) {
          viewportG.createSvg('circle', {
            attr: {
              cx: String(p.x),
              cy: String(p.y),
              r: isSelected ? '4' : '3',
              fill: 'var(--text-accent)',
              style: 'pointer-events: none;',
            },
          });
        }

        // Current intensity annotation on wire
        if (conn.current) {
          this.drawWireCurrentAnnotation(viewportG, p1, p2, fromComp, conn);
        }
      });
    }

    // 3. Components
    if (Array.isArray(this.data.components)) {
      for (const comp of this.data.components) {
        try {
          const isSelected = this.selectedComponentId === comp.id;
          const isEditingThisText =
            comp.type === 'text' && this.editingTextComponentId === comp.id;
          const rot = comp.rotation || 0;

          const compG = viewportG.createSvg('g', {
            attr: {
              class: isSelected ? 'circuit-comp-group is-selected' : 'circuit-comp-group',
              transform: `translate(${comp.x}, ${comp.y}) rotate(${rot})`,
              stroke: isSelected ? 'var(--text-accent)' : 'var(--text-normal)',
              'stroke-width': '2',
              fill: 'none',
              style: isEditingThisText
                ? 'cursor: default; pointer-events: all;'
                : 'cursor: grab; pointer-events: all;',
              'data-component-id': comp.id,
            },
          });

          // Component hit area
          if (comp.type === 'junction') {
            compG.createSvg('circle', {
              attr: {
                class: 'circuit-comp-hit',
                cx: '0',
                cy: '0',
                r: '12',
                fill: isSelected ? 'var(--background-modifier-hover)' : 'transparent',
                'fill-opacity': isSelected ? '0.3' : '0',
                stroke: isSelected ? 'var(--text-accent)' : 'none',
                'stroke-width': '1.5',
                style: 'cursor: grab; pointer-events: all;',
              },
            });
          } else if (comp.type === 'text') {
            if (!isEditingThisText) {
              const rawText = comp.text || comp.label || '';
              const lines = rawText.split('\n');
              const lineCount = Math.max(1, lines.length);
              const maxLineLen = Math.max(8, ...lines.map((l) => l.length));
              const hitHeight = Math.max(40, lineCount * 24 + 12);
              const hitWidth = Math.max(140, Math.min(420, maxLineLen * 9 + 30));
              const hitX = -Math.round(hitWidth / 2);
              const hitY = -Math.round(hitHeight / 2);

              compG.createSvg('rect', {
                attr: {
                  class: 'circuit-comp-hit circuit-text-hit',
                  x: String(hitX),
                  y: String(hitY),
                  width: String(hitWidth),
                  height: String(hitHeight),
                  fill: isSelected ? 'var(--background-modifier-hover)' : 'transparent',
                  'fill-opacity': isSelected ? '0.25' : '0',
                  stroke: isSelected ? 'var(--text-accent)' : 'none',
                  'stroke-width': '1.5',
                  'stroke-dasharray': isSelected ? '4 2' : 'none',
                  rx: '4',
                  style: 'cursor: grab; pointer-events: all;',
                },
              });
            }
          } else {
            compG.createSvg('rect', {
              attr: {
                class: 'circuit-comp-hit',
                x: '-35',
                y: '-25',
                width: '70',
                height: '50',
                fill: isSelected ? 'var(--background-modifier-hover)' : 'transparent',
                'fill-opacity': isSelected ? '0.25' : '0',
                stroke: isSelected ? 'var(--text-accent)' : 'none',
                'stroke-width': '1.5',
                'stroke-dasharray': isSelected ? '4 2' : 'none',
                rx: '4',
                style: 'cursor: grab; pointer-events: all;',
              },
            });
          }

          if (isEditingThisText) {
            compG.createSvg('rect', {
              attr: {
                x: '-70',
                y: '-20',
                width: '140',
                height: '40',
                stroke: 'var(--text-accent)',
                'stroke-width': '1.5',
                'stroke-dasharray': '4 2',
                fill: 'var(--text-accent)',
                'fill-opacity': '0.05',
                rx: '4',
              },
            });
          } else {
            drawComponentSymbol(compG, comp, true, {
              app: this.app,
              ownerComponent: this.ownerComponent,
            });
          }

          // Pin Hotspots
          const pins = getComponentPins(comp);
          for (const pin of pins) {
            const isWiringSource = this.wiringSourcePin?.pinId === pin.pinId;
            const isHoveredTarget = this.hoveredPinId === pin.pinId;

            const pinG = viewportG.createSvg('g', {
              attr: {
                class: 'circuit-pin-wrap',
                'data-pin-id': pin.pinId,
                style: 'cursor: crosshair;',
              },
            });

            // Transparent wide hit area (radius 14)
            pinG.createSvg('circle', {
              attr: {
                cx: String(pin.point.x),
                cy: String(pin.point.y),
                r: '14',
                fill: 'transparent',
                'pointer-events': 'all',
                'data-pin-id': pin.pinId,
              },
            });

            // Visible pin circle
            pinG.createSvg('circle', {
              attr: {
                class: 'circuit-pin-target',
                cx: String(pin.point.x),
                cy: String(pin.point.y),
                r: isWiringSource ? '6' : isHoveredTarget ? '5.5' : '4',
                fill: isWiringSource
                  ? 'var(--interactive-accent)'
                  : isHoveredTarget
                  ? 'var(--text-accent-hover)'
                  : 'var(--text-accent)',
                stroke: 'var(--background-primary)',
                'stroke-width': '1.5',
                style: 'pointer-events: none;',
              },
            });
          }
        } catch (compErr: unknown) {
          console.error(`Error rendering component ${comp.id}:`, compErr);
        }
      }
    }

    // 4. Mesh Loops (Maglie)
    if (Array.isArray(this.data.loops)) {
      for (const loop of this.data.loops) {
        const isSelected = this.selectedLoopId === loop.id;
        drawLoopSymbol(viewportG, loop, isSelected);
      }
    }

    // 5. Ghost wire in progress
    if (this.wiringSourcePin) {
      const fromP = this.wiringSourcePin.point;
      const hoveredPin = this.getPinAt(this.mousePos);
      const targetPin =
        hoveredPin && hoveredPin.pinId !== this.wiringSourcePin.pinId ? hoveredPin : null;
      const toP = targetPin
        ? targetPin.point
        : { x: snapToGrid(this.mousePos.x), y: snapToGrid(this.mousePos.y) };
      const fromComp = this.data.components?.find((c) =>
        this.wiringSourcePin ? this.wiringSourcePin.componentId === c.id : false
      );
      const d = generateWirePath(fromP, toP, fromComp);

      viewportG.createSvg('path', {
        attr: {
          class: 'circuit-ghost-wire',
          d,
          stroke: 'var(--text-accent)',
          'stroke-width': '2.5',
          'stroke-dasharray': '5 3',
          fill: 'none',
          style: 'pointer-events: none;',
        },
      });

      viewportG.createSvg('circle', {
        attr: {
          cx: String(toP.x),
          cy: String(toP.y),
          r: targetPin ? '6' : '3.5',
          fill: targetPin ? 'var(--interactive-accent)' : 'var(--text-accent)',
          style: 'pointer-events: none;',
        },
      });
    }

    // 6. Ghost preview for placement (components & loops)
    if (this.activeTool !== 'select') {
      const snapX = snapToGrid(this.mousePos.x);
      const snapY = snapToGrid(this.mousePos.y);

      if (this.activeTool === 'loop') {
        const ghostLoop: CircuitLoop = {
          id: 'preview_loop',
          label: 'M',
          value: '∑V = 0',
          x: snapX,
          y: snapY,
          radius: 24,
          direction: 'cw',
        };
        const loopPreviewG = viewportG.createSvg('g', {
          attr: {
            class: 'circuit-ghost-loop',
            opacity: '0.6',
            style: 'pointer-events: none;',
          },
        });
        drawLoopSymbol(loopPreviewG, ghostLoop, false);
      } else {
        const ghostG = viewportG.createSvg('g', {
          attr: {
            class: 'circuit-ghost-comp',
            transform: `translate(${snapX}, ${snapY}) rotate(${this.ghostRotation})`,
            stroke: 'var(--text-accent)',
            'stroke-width': '2',
            opacity: '0.6',
            fill: 'none',
            style: 'pointer-events: none;',
          },
        });

        if (this.activeTool === 'text') {
          // Bounding dashed box centered at cursor
          ghostG.createSvg('rect', {
            attr: {
              x: '-70',
              y: '-20',
              width: '140',
              height: '40',
              stroke: 'var(--text-accent)',
              'stroke-width': '1.5',
              'stroke-dasharray': '4 2',
              fill: 'var(--text-accent)',
              'fill-opacity': '0.08',
              rx: '4',
            },
          });
          // Center anchor point (cursor is at center of block)
          ghostG.createSvg('circle', {
            attr: {
              cx: '0',
              cy: '0',
              r: '3.5',
              fill: 'var(--text-accent)',
              stroke: 'var(--background-primary)',
              'stroke-width': '1.5',
            },
          });
          drawComponentSymbol(
            ghostG,
            { type: 'text', text: '$V_{in}(t) = 10\\text{V}$' },
            true,
            { app: this.app, ownerComponent: this.ownerComponent }
          );
        } else {
          drawComponentSymbol(
            ghostG,
            { type: this.activeTool },
            false,
            { app: this.app, ownerComponent: this.ownerComponent }
          );
        }
      }
    }

    this.updateInlineEditorPosition();
  }

  private drawWireCurrentAnnotation(
    parentG: SVGGElement,
    p1: Point,
    p2: Point,
    fromComp?: CircuitComponent,
    conn?: CircuitConnection
  ): void {
    if (!conn?.current) return;
    const pts = getWirePoints(p1, p2, fromComp, conn.waypoints);
    if (pts.length < 2) return;

    // Pick the middle segment of the wire
    const midSegIdx = Math.floor((pts.length - 1) / 2);
    const segA = pts[midSegIdx];
    const segB = pts[midSegIdx + 1];

    const isForward = conn.currentDirection !== 'backward';
    const startPt = isForward ? segA : segB;
    const endPt = isForward ? segB : segA;

    const mx = Math.round((startPt.x + endPt.x) / 2);
    const my = Math.round((startPt.y + endPt.y) / 2);
    const angle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);

    const g = parentG.createSvg('g', {
      attr: {
        class: 'circuit-wire-current-badge',
        transform: `translate(${mx}, ${my})`,
        style: 'pointer-events: none;',
      },
    });

    // Arrow indicating current flow direction
    const arrowG = g.createSvg('g', {
      attr: {
        transform: `rotate(${(angle * 180) / Math.PI})`,
      },
    });
    arrowG.createSvg('line', {
      attr: {
        x1: '-10',
        y1: '-6',
        x2: '8',
        y2: '-6',
        stroke: 'var(--text-accent)',
        'stroke-width': '1.8',
      },
    });
    arrowG.createSvg('polygon', {
      attr: {
        points: '5,-9 11,-6 5,-3',
        fill: 'var(--text-accent)',
        stroke: 'none',
      },
    });

    // Current text (e.g. 2A, i1)
    const textEl = g.createSvg('text', {
      attr: {
        x: '0',
        y: '-11',
        fill: 'var(--text-accent)',
        'font-size': '10',
        'font-weight': 'bold',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-style': 'italic',
      },
    });
    textEl.textContent = conn.current;
  }

  private bindEvents(): void {
    // 1. Pointer Down
    this.svgEl.addEventListener('pointerdown', (event: PointerEvent) => {
      this.mousePos = this.getSvgCoordinates(event);
      this.pointerDownPos = { ...this.mousePos };
      this.didDragMove = false;
      this.pendingCompClick = null;
      this.pendingConnIndex = null;
      this.pendingLoopClick = null;

      // Right-click: if ghost placement active, cancel it
      if (event.button === 2) {
        if (this.activeTool !== 'select') {
          this.cancelActiveAction();
        }
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      // Check if panning triggered by Middle Click (button 1), Space+LeftClick, or LeftClick on empty canvas background
      const isBg =
        target === this.svgEl ||
        target.classList.contains('circuit-canvas-hit-area') ||
        target.classList.contains('circuit-grid-rect') ||
        target.classList.contains('circuit-bg-drag');

      if (
        event.button === 1 ||
        this.isSpacePressed ||
        (event.button === 0 && isBg && this.activeTool === 'select' && !this.isWiring)
      ) {
        this.isPanning = true;
        this.panStartClient = { x: event.clientX, y: event.clientY };
        this.panOrigin = { x: this.pan.x, y: this.pan.y };
        this.svgEl.addClass('is-panning');
        try {
          this.svgEl.setPointerCapture(event.pointerId);
        } catch {
          // Safe fallback
        }
        return;
      }

      if (event.button !== 0) return;

      // If clicked inside inline text editor, do not drag or deselect
      if (
        target.tagName.toLowerCase() === 'input' ||
        Boolean(target.closest('.circuit-inline-editor-wrap'))
      ) {
        return;
      }

      // If text editing was active and user clicked outside, finish edit
      if (this.editingTextComponentId) {
        const compTarget = target.closest<SVGGElement>('[data-component-id]');
        if (!compTarget || compTarget.dataset.componentId !== this.editingTextComponentId) {
          this.finishInlineTextEdit();
        }
      }

      // If a component or loop is currently moving or being dragged, clicking left button drops and releases it!
      if (this.isDragging || this.movingComponentId) {
        this.isDragging = false;
        this.movingComponentId = null;
        this.isPointerDown = false;
        this.pendingCompClick = null;
        this.pendingLoopClick = null;
        this.pendingConnIndex = null;
        this.didDragMove = false;
        try {
          if (this.svgEl.hasPointerCapture(event.pointerId)) {
            this.svgEl.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Safe fallback
        }
        this.callbacks.onDataChange();
        this.render();
        return;
      }

      this.isPointerDown = true;

      // Click to place ghost component or loop
      if (this.activeTool !== 'select') {
        const snapX = snapToGrid(this.mousePos.x);
        const snapY = snapToGrid(this.mousePos.y);

        if (this.activeTool === 'loop') {
          this.addLoop(snapX, snapY);
        } else {
          const comp = this.addComponent(this.activeTool, snapX, snapY, this.ghostRotation);
          if (this.activeTool === 'text') {
            this.setTool('select');
            this.callbacks.onToolChange?.('select');
            this.startInlineTextEdit(comp);
            return;
          }
        }

        this.setTool('select');
        this.callbacks.onToolChange?.('select');
        this.render();
        return;
      }

      // A. Check if clicked on a pin
      const pinTarget = target.closest<SVGElement>('[data-pin-id]');
      if (pinTarget) {
        const pinId = pinTarget.dataset.pinId || '';
        const clickedPin = this.getPin(pinId);
        if (clickedPin) {
          if (!this.wiringSourcePin) {
            // Start wiring
            this.wiringSourcePin = clickedPin;
            this.isWiring = true;
            this.selectedComponentId = null;
            this.selectedConnectionIndex = null;
            this.selectedLoopId = null;
            this.callbacks.onSelectionChange('none');
          } else if (this.wiringSourcePin.pinId !== clickedPin.pinId) {
            // Finish wiring between two pins
            this.addConnection(this.wiringSourcePin, clickedPin);
            this.wiringSourcePin = null;
            this.isWiring = false;
            this.callbacks.onDataChange();
          } else {
            // Clicked same pin: cancel wiring
            this.wiringSourcePin = null;
            this.isWiring = false;
          }

          try {
            this.svgEl.setPointerCapture(event.pointerId);
          } catch {
            // Safe fallback
          }

          this.render();
          return;
        }
      }

      // If clicked anywhere else while wiring, cancel wiring
      if (this.wiringSourcePin) {
        this.wiringSourcePin = null;
        this.isWiring = false;
      }

      // B. Check if clicked on a component
      const componentTarget = target.closest<SVGGElement>('[data-component-id]');
      if (componentTarget) {
        const componentId = componentTarget.dataset.componentId;
        const comp = this.data.components?.find((item) => item.id === componentId);
        if (comp) {
          if (this.editingTextComponentId === comp.id) {
            return;
          }
          this.pendingCompClick = comp;
          this.selectedComponentId = comp.id;
          this.selectedConnectionIndex = null;
          this.selectedLoopId = null;
          this.dragOffset = {
            x: this.mousePos.x - comp.x,
            y: this.mousePos.y - comp.y,
          };

          try {
            this.svgEl.setPointerCapture(event.pointerId);
          } catch {
            // Safe fallback
          }

          this.callbacks.onSelectionChange('component');
          this.render();
          return;
        }
      }

      // C. Check if clicked on a loop (maglia)
      const loopTarget = target.closest<SVGGElement>('[data-loop-id]');
      if (loopTarget) {
        const loopId = loopTarget.dataset.loopId;
        const loop = this.data.loops?.find((l) => l.id === loopId);
        if (loop) {
          this.pendingLoopClick = loop;
          this.selectedLoopId = loop.id;
          this.selectedComponentId = null;
          this.selectedConnectionIndex = null;
          this.dragOffset = {
            x: this.mousePos.x - loop.x,
            y: this.mousePos.y - loop.y,
          };

          try {
            this.svgEl.setPointerCapture(event.pointerId);
          } catch {
            // Safe fallback
          }

          this.callbacks.onSelectionChange('loop');
          this.render();
          return;
        }
      }

      // D. Check if clicked on a connection
      const connectionTarget = target.closest<SVGPathElement>('[data-connection-index]');
      if (connectionTarget) {
        const connIdx = Number(connectionTarget.dataset.connectionIndex);
        this.pendingConnIndex = connIdx;
        this.selectedConnectionIndex = connIdx;
        this.selectedComponentId = null;
        this.selectedLoopId = null;
        this.callbacks.onSelectionChange('connection');
        this.render();
        return;
      }

      // E. Clicked on canvas background: deselect
      this.selectedComponentId = null;
      this.selectedConnectionIndex = null;
      this.selectedLoopId = null;
      this.callbacks.onSelectionChange('none');
      this.render();
    });

    // 2. Pointer Move
    this.svgEl.addEventListener('pointermove', (event: PointerEvent) => {
      if (this.isPanning) {
        const dx = event.clientX - this.panStartClient.x;
        const dy = event.clientY - this.panStartClient.y;
        this.pan.x = this.panOrigin.x + dx;
        this.pan.y = this.panOrigin.y + dy;
        this.updateViewportTransform();
        return;
      }
      this.mousePos = this.getSvgCoordinates(event);

      // Only initiate dragging if mouse button is held down
      if (this.isPointerDown && event.buttons === 1) {
        const moveDist = Math.hypot(
          this.mousePos.x - this.pointerDownPos.x,
          this.mousePos.y - this.pointerDownPos.y
        );

        if (moveDist > 3 && (this.pendingCompClick || this.pendingLoopClick)) {
          this.isDragging = true;
          this.didDragMove = true;
        }
      }

      // If dragging from mouse-down, but the button was released (e.g. outside svg): auto drop!
      if (this.isDragging && !this.movingComponentId && event.buttons === 0) {
        this.isDragging = false;
        this.isPointerDown = false;
        this.pendingCompClick = null;
        this.pendingLoopClick = null;
        this.pendingConnIndex = null;
        this.callbacks.onDataChange();
        this.render();
        return;
      }

      if (this.isDragging) {
        if (this.selectedComponentId && this.data.components) {
          const comp = this.data.components.find((c) => c.id === this.selectedComponentId);
          if (comp) {
            comp.x = snapToGrid(this.mousePos.x - this.dragOffset.x);
            comp.y = snapToGrid(this.mousePos.y - this.dragOffset.y);
            this.render();
          }
        } else if (this.selectedLoopId && this.data.loops) {
          const loop = this.data.loops.find((l) => l.id === this.selectedLoopId);
          if (loop) {
            loop.x = snapToGrid(this.mousePos.x - this.dragOffset.x);
            loop.y = snapToGrid(this.mousePos.y - this.dragOffset.y);
            this.render();
          }
        }
      } else if (this.wiringSourcePin) {
        const hovered = this.getPinAt(this.mousePos);
        this.hoveredPinId = hovered ? hovered.pinId : null;
        this.render();
      } else if (this.activeTool !== 'select') {
        this.render();
      }
    });

    // 3. Pointer Up
    this.svgEl.addEventListener('pointerup', (event: PointerEvent) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.svgEl.removeClass('is-panning');
        try {
          this.svgEl.releasePointerCapture(event.pointerId);
        } catch {
          // Safe fallback
        }
        return;
      }
      this.mousePos = this.getSvgCoordinates(event);
      this.isPointerDown = false;
      let changed = false;

      if (this.isDragging) {
        this.isDragging = false;
        this.movingComponentId = null;
        this.pendingCompClick = null;
        this.pendingLoopClick = null;
        this.pendingConnIndex = null;
        if (this.didDragMove) {
          changed = true;
        }
      }

      // Check if dragged wire dropped on a target pin or existing wire
      if (this.isWiring && this.wiringSourcePin) {
        const targetPin = this.getPinAt(this.mousePos);
        if (targetPin && targetPin.pinId !== this.wiringSourcePin.pinId) {
          this.addConnection(this.wiringSourcePin, targetPin);
          this.wiringSourcePin = null;
          this.hoveredPinId = null;
          this.isWiring = false;
          changed = true;
        } else {
          // Check if dropped onto an existing wire to branch it automatically
          const wireHit = this.getWireIndexAt(this.mousePos, this.wiringSourcePin.pinId);
          if (wireHit !== null && this.data.connections && this.data.connections[wireHit]) {
            const oldConn = this.data.connections[wireHit];
            const pinCoords = buildPinMap(this.data.components || []);
            const p1 = pinCoords.get(oldConn.from);
            const p2 = pinCoords.get(oldConn.to);
            const fromComp = this.data.components?.find((c) => oldConn.from.startsWith(c.id));
            const closest =
              p1 && p2 ? getClosestPointOnWire(this.mousePos, p1, p2, fromComp, oldConn.waypoints) : null;
            const jX = closest ? closest.point.x : snapToGrid(this.mousePos.x);
            const jY = closest ? closest.point.y : snapToGrid(this.mousePos.y);

            const jId = this.generateNextId('junction');
            const jComp: CircuitComponent = {
              id: jId,
              type: 'junction',
              x: jX,
              y: jY,
              rotation: 0,
              label: jId,
            };
            if (!this.data.components) this.data.components = [];
            this.data.components.push(jComp);

            const c1: CircuitConnection = {
              from: oldConn.from,
              to: `${jId}.j`,
              color: oldConn.color,
            };
            const c2: CircuitConnection = {
              from: `${jId}.j`,
              to: oldConn.to,
              color: oldConn.color,
            };
            const cNew: CircuitConnection = {
              from: this.wiringSourcePin.pinId,
              to: `${jId}.j`,
            };
            this.data.connections.splice(wireHit, 1, c1, c2, cNew);

            this.wiringSourcePin = null;
            this.hoveredPinId = null;
            this.isWiring = false;
            changed = true;
          } else {
            this.isWiring = false;
          }
        }
      }

      try {
        if (this.svgEl.hasPointerCapture(event.pointerId)) {
          this.svgEl.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Safe fallback
      }

      if (changed) this.callbacks.onDataChange();
      this.render();
    });

    // 4. Click (Left click context menu when element was clicked without dragging)
    this.svgEl.addEventListener('click', (event: MouseEvent) => {
      if (event.button !== 0 || this.activeTool !== 'select' || this.didDragMove) {
        this.pendingCompClick = null;
        this.pendingConnIndex = null;
        this.pendingLoopClick = null;
        this.didDragMove = false;
        return;
      }

      if (this.pendingCompClick) {
        const comp = this.pendingCompClick;
        this.pendingCompClick = null;
        this.showComponentContextMenu(event, comp);
        return;
      }

      if (this.pendingConnIndex !== null) {
        const idx = this.pendingConnIndex;
        this.pendingConnIndex = null;
        if (this.data.connections && this.data.connections[idx]) {
          this.showConnectionContextMenu(event, idx);
          return;
        }
      }

      if (this.pendingLoopClick) {
        const loop = this.pendingLoopClick;
        this.pendingLoopClick = null;
        this.showLoopContextMenu(event, loop);
        return;
      }
    });

    // 5. Context Menu on Right-Click
    this.svgEl.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      if (this.activeTool !== 'select') {
        this.cancelActiveAction();
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const compTarget = target.closest<SVGGElement>('[data-component-id]');
      if (compTarget) {
        const comp = this.data.components?.find((c) => c.id === compTarget.dataset.componentId);
        if (comp) {
          this.selectedComponentId = comp.id;
          this.selectedConnectionIndex = null;
          this.selectedLoopId = null;
          this.callbacks.onSelectionChange('component');
          this.render();
          this.showComponentContextMenu(event, comp);
          return;
        }
      }

      const connTarget = target.closest<SVGPathElement>('[data-connection-index]');
      if (connTarget) {
        const idx = Number(connTarget.dataset.connectionIndex);
        if (this.data.connections && this.data.connections[idx]) {
          this.selectedConnectionIndex = idx;
          this.selectedComponentId = null;
          this.selectedLoopId = null;
          this.callbacks.onSelectionChange('connection');
          this.render();
          this.showConnectionContextMenu(event, idx);
          return;
        }
      }

      const loopTarget = target.closest<SVGGElement>('[data-loop-id]');
      if (loopTarget) {
        const loop = this.data.loops?.find((l) => l.id === loopTarget.dataset.loopId);
        if (loop) {
          this.selectedLoopId = loop.id;
          this.selectedComponentId = null;
          this.selectedConnectionIndex = null;
          this.callbacks.onSelectionChange('loop');
          this.render();
          this.showLoopContextMenu(event, loop);
          return;
        }
      }

      // Empty canvas area: show component addition context menu
      this.showEmptyCanvasContextMenu(event);
    });

    // 6. Pointer Cancel
    this.svgEl.addEventListener('pointercancel', (event: PointerEvent) => {
      if (this.isDragging) this.callbacks.onDataChange();
      this.isDragging = false;
      this.isPointerDown = false;
      this.movingComponentId = null;
      this.isWiring = false;
      this.wiringSourcePin = null;
      this.hoveredPinId = null;
      this.pendingCompClick = null;
      this.pendingConnIndex = null;
      this.pendingLoopClick = null;
      this.didDragMove = false;
      try {
        if (this.svgEl.hasPointerCapture(event.pointerId)) {
          this.svgEl.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Safe fallback
      }
      this.render();
    });

    // 7. Double Click
    this.svgEl.addEventListener('dblclick', (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const componentTarget = target.closest<SVGGElement>('[data-component-id]');
      if (componentTarget) {
        const componentId = componentTarget.dataset.componentId;
        const comp = this.data.components?.find((item) => item.id === componentId);
        if (comp) {
          if (comp.type === 'text') {
            this.startInlineTextEdit(comp);
            return;
          }
          this.callbacks.onEditComponent(comp);
          return;
        }
      }

      const connTarget = target.closest<SVGPathElement>('[data-connection-index]');
      if (connTarget) {
        const idx = Number(connTarget.dataset.connectionIndex);
        const conn = this.data.connections?.[idx];
        if (conn) {
          this.callbacks.onEditConnection?.(conn);
          return;
        }
      }

      const loopTarget = target.closest<SVGGElement>('[data-loop-id]');
      if (loopTarget) {
        const loopId = loopTarget.dataset.loopId;
        const loop = this.data.loops?.find((l) => l.id === loopId);
        if (loop) {
          this.callbacks.onEditLoop?.(loop);
          return;
        }
      }
    });

    // 8. Mouse wheel zoom centered at cursor
    this.onWheelHandler = (e: WheelEvent) => {
      this.onWheel(e);
    };
    this.svgEl.addEventListener('wheel', this.onWheelHandler, { passive: false });

    // 9. Spacebar pan mode
    this.onKeyDownHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !this.isSpacePressed) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            (active as HTMLElement).isContentEditable ||
            Boolean(active.closest('.cm-editor')))
        ) {
          return;
        }
        this.isSpacePressed = true;
        this.svgEl.addClass('is-space-pressed');
      }
    };
    this.onKeyUpHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.svgEl.removeClass('is-space-pressed');
      }
    };
    window.addEventListener('keydown', this.onKeyDownHandler);
    window.addEventListener('keyup', this.onKeyUpHandler);
  }

  private showComponentContextMenu(event: MouseEvent, comp: CircuitComponent): void {
    const menu = new Menu();

    if (comp.type === 'text') {
      menu.addItem((item) =>
        item
          .setTitle(`Modifica testo e formula LaTeX (${comp.id})`)
          .setIcon('file-text')
          .onClick(() => {
            this.startInlineTextEdit(comp);
          })
      );
    } else {
      menu.addItem((item) =>
        item
          .setTitle(`Modifica proprietà (${comp.id})`)
          .setIcon('pencil')
          .onClick(() => {
            this.callbacks.onEditComponent(comp);
          })
      );
    }

    menu.addItem((item) =>
      item
        .setTitle('Ruota 90° (R)')
        .setIcon('rotate-cw')
        .onClick(() => {
          this.selectedComponentId = comp.id;
          this.rotateSelected();
        })
    );

    menu.addItem((item) =>
      item
        .setTitle('Sposta componente (Click per rilasciare)')
        .setIcon('move')
        .onClick(() => {
          this.movingComponentId = comp.id;
          this.selectedComponentId = comp.id;
          this.isDragging = true;
          this.dragOffset = { x: 0, y: 0 };
          this.callbacks.onSelectionChange('component');
          this.render();
        })
    );

    if (comp.type !== 'text' && comp.type !== 'junction') {
      menu.addSeparator();

      // Sign convention items (Convenzione Utilizzatore / Generatore)
      menu.addItem((item) =>
        item
          .setTitle('Convenzione Utilizzatore (+ entrante)')
          .setChecked(comp.convention === 'passive')
          .onClick(() => {
            comp.convention = 'passive';
            this.callbacks.onDataChange();
            this.render();
          })
      );

      menu.addItem((item) =>
        item
          .setTitle('Convenzione Generatore (+ uscente)')
          .setChecked(comp.convention === 'active')
          .onClick(() => {
            comp.convention = 'active';
            this.callbacks.onDataChange();
            this.render();
          })
      );

      if (comp.convention && comp.convention !== 'none') {
        menu.addItem((item) =>
          item
            .setTitle('Rimuovi convenzione polarità')
            .setIcon('x')
            .onClick(() => {
              comp.convention = 'none';
              this.callbacks.onDataChange();
              this.render();
            })
        );
      }
    }

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Elimina componente (Del)')
        .setIcon('trash-2')
        .onClick(() => {
          this.selectedComponentId = comp.id;
          this.deleteSelected();
        })
    );

    menu.showAtMouseEvent(event);
  }

  private showConnectionContextMenu(event: MouseEvent, connIdx: number): void {
    const menu = new Menu();
    const conn = this.data.connections![connIdx];

    menu.addItem((item) =>
      item
        .setTitle('Ramifica connessione (Inserisci nodo)')
        .setIcon('git-fork')
        .onClick(() => {
          this.branchConnection(connIdx, this.mousePos);
        })
    );

    menu.addItem((item) =>
      item
        .setTitle(`Imposta intensità corrente (${conn.current || 'Nessuna'})`)
        .setIcon('gauge')
        .onClick(() => {
          this.callbacks.onEditConnection?.(conn);
        })
    );

    menu.addItem((item) =>
      item
        .setTitle('Cambia colore filo')
        .setIcon('palette')
        .onClick(() => {
          this.callbacks.onEditConnection?.(conn);
        })
    );

    if (conn.current) {
      menu.addItem((item) =>
        item
          .setTitle(`Inverti verso corrente (${conn.currentDirection === 'backward' ? 'Indietro ◀' : 'Avanti ▶'})`)
          .setIcon('refresh-cw')
          .onClick(() => {
            conn.currentDirection = conn.currentDirection === 'backward' ? 'forward' : 'backward';
            this.callbacks.onDataChange();
            this.render();
          })
      );
    }

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Elimina filo (Del)')
        .setIcon('trash-2')
        .onClick(() => {
          this.selectedConnectionIndex = connIdx;
          this.deleteSelected();
        })
    );

    menu.showAtMouseEvent(event);
  }

  private showLoopContextMenu(event: MouseEvent, loop: CircuitLoop): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle(`Modifica equazione maglia (${loop.label})`)
        .setIcon('pencil')
        .onClick(() => {
          this.callbacks.onEditLoop?.(loop);
        })
    );

    menu.addItem((item) =>
      item
        .setTitle(`Inverti verso (${loop.direction === 'ccw' ? 'Orario ↻' : 'Antiorario ↺'})`)
        .setIcon('refresh-cw')
        .onClick(() => {
          loop.direction = loop.direction === 'ccw' ? 'cw' : 'ccw';
          this.callbacks.onDataChange();
          this.render();
        })
    );

    menu.addItem((item) =>
      item
        .setTitle('Sposta maglia (Click per rilasciare)')
        .setIcon('move')
        .onClick(() => {
          this.movingComponentId = loop.id;
          this.selectedLoopId = loop.id;
          this.isDragging = true;
          this.dragOffset = { x: 0, y: 0 };
          this.callbacks.onSelectionChange('loop');
          this.render();
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Elimina maglia (Del)')
        .setIcon('trash-2')
        .onClick(() => {
          this.selectedLoopId = loop.id;
          this.deleteSelected();
        })
    );

    menu.showAtMouseEvent(event);
  }

  private showEmptyCanvasContextMenu(event: MouseEvent): void {
    const menu = new Menu();
    const coords = this.getSvgCoordinates(event);
    const snapX = snapToGrid(coords.x);
    const snapY = snapToGrid(coords.y);

    // Passivi
    menu.addItem((item) =>
      item
        .setTitle('Resistore (R)')
        .setIcon('zap')
        .onClick(() => {
          this.addComponent('resistor', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Condensatore (C)')
        .setIcon('zap')
        .onClick(() => {
          this.addComponent('capacitor', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Induttore (L)')
        .setIcon('zap')
        .onClick(() => {
          this.addComponent('inductor', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Diodo (D)')
        .setIcon('play')
        .onClick(() => {
          this.addComponent('diode', snapX, snapY);
          this.render();
        })
    );

    menu.addSeparator();

    // Sorgenti Indipendenti
    menu.addItem((item) =>
      item
        .setTitle('Sorgente DC (V)')
        .setIcon('circle-dot')
        .onClick(() => {
          this.addComponent('dc_source', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Sorgente AC (VAC)')
        .setIcon('activity')
        .onClick(() => {
          this.addComponent('ac_source', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Generatore Corrente (I)')
        .setIcon('arrow-up-circle')
        .onClick(() => {
          this.addComponent('current_source', snapX, snapY);
          this.render();
        })
    );

    menu.addSeparator();

    // Sorgenti Dipendenti
    menu.addItem((item) =>
      item
        .setTitle('VCVS (E)')
        .setIcon('diamond')
        .onClick(() => {
          this.addComponent('vcvs', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('CCVS (H)')
        .setIcon('diamond')
        .onClick(() => {
          this.addComponent('ccvs', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('VCCS (G)')
        .setIcon('diamond')
        .onClick(() => {
          this.addComponent('vccs', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('CCCS (F)')
        .setIcon('diamond')
        .onClick(() => {
          this.addComponent('cccs', snapX, snapY);
          this.render();
        })
    );

    menu.addSeparator();

    // Interruttori & Altri
    menu.addItem((item) =>
      item
        .setTitle('Interruttore Aperto (SW)')
        .setIcon('toggle-left')
        .onClick(() => {
          this.addComponent('switch_open', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Interruttore Chiuso (SW)')
        .setIcon('toggle-right')
        .onClick(() => {
          this.addComponent('switch_closed', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Deviatore SPDT')
        .setIcon('git-branch')
        .onClick(() => {
          this.addComponent('switch_spdt', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Terra (GND)')
        .setIcon('download')
        .onClick(() => {
          this.addComponent('ground', snapX, snapY);
          this.render();
        })
    );
    menu.addItem((item) =>
      item
        .setTitle('Nodo di Giunzione (J)')
        .setIcon('dot')
        .onClick(() => {
          this.addComponent('junction', snapX, snapY);
          this.render();
        })
    );

    menu.addSeparator();

    // Maglia
    menu.addItem((item) =>
      item
        .setTitle('Maglia / Loop (∑V = 0)')
        .setIcon('rotate-cw')
        .onClick(() => {
          this.addLoop(snapX, snapY);
          this.render();
        })
    );

    // Testo & Formula LaTeX
    menu.addItem((item) =>
      item
        .setTitle('Testo & Formula LaTeX')
        .setIcon('type')
        .onClick(() => {
          const comp = this.addComponent('text', snapX, snapY);
          this.startInlineTextEdit(comp);
        })
    );

    menu.showAtMouseEvent(event);
  }

  private createInlineEditorOverlay(comp: CircuitComponent): void {
    if (this.inlineEditorOverlayEl) {
      this.inlineEditorOverlayEl.remove();
      this.inlineEditorOverlayEl = null;
    }

    const rawText = comp.text !== undefined ? comp.text : (comp.label || '');
    const lines = rawText.split('\n');
    const maxLineLen = Math.max(14, ...lines.map((l) => l.length));
    const width = Math.max(260, Math.min(480, maxLineLen * 9 + 60));

    this.inlineEditorOverlayEl = this.containerEl.createDiv({ cls: 'circuit-inline-editor-overlay' });
    this.updateInlineEditorPosition();

    const wrap = this.inlineEditorOverlayEl.createDiv({ cls: 'circuit-inline-editor-wrap' });
    wrap.style.width = `${width}px`;

    // Prevent canvas drag or selection from interfering with the editor
    this.inlineEditorOverlayEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('pointerup', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('mouseup', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('dblclick', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('contextmenu', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('wheel', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('keydown', (e) => e.stopPropagation());
    this.inlineEditorOverlayEl.addEventListener('keyup', (e) => e.stopPropagation());

    const appAny = this.app as unknown as {
      plugins?: {
        getPlugin?: (id: string) => unknown;
        plugins?: Record<string, unknown>;
      };
    };

    const latexsSuitePlugin = (
      appAny.plugins?.getPlugin?.('obsidian-latex-suite') ??
      appAny.plugins?.plugins?.['obsidian-latex-suite']
    ) as { editorExtensions?: Extension[] } | undefined;

    // Build math language parser for LaTeX Suite integration if available
    let mathLanguageExtension: Extension | null = null;
    try {
      const winWithReq = window as unknown as { require?: (mod: string) => unknown };
      const req = winWithReq.require;
      const lr = req ? (req('@lezer/lr') as { LRParser?: { deserialize: (spec: unknown) => unknown } }) : null;
      if (lr?.LRParser) {
        const mathParser = lr.LRParser.deserialize({
          version: 14,
          states: "zOOOO?MrOOQOPOOOOOO'#Ca'#CaOYOPO'#C_OOOO?MtOOOOO-E6_-E6_QOOOOO",
          stateData: 'b~OVQOURP~OVQOURX~O',
          goto: 'fUPPVY]`RPORSPRUSQRPRTR',
          nodeNames:
            '⚠ Document formatting_formatting-math_formatting-math-begin_keyword_math_math-block math formatting_formatting-math_formatting-math-end_keyword_math_math-',
          maxTerm: 7,
          skippedNodes: [0],
          repeatNodeCount: 1,
          tokenData: "i~RRO;'S[;'S;=`a;=`O[~aOV~~fPV~;=`<%l[",
          tokenizers: [0],
          topRules: { Document: [0, 1] },
          tokenPrec: 0,
        });
        mathLanguageExtension = LRLanguage.define({ parser: mathParser as never });
      }
    } catch (err) {
      console.warn('[circuit] Failed to initialize math parser for LaTeX Suite:', err);
    }

    const coreExtensions: Extension[] = [
      history(),
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            this.finishInlineTextEdit();
            return true;
          },
        },
        {
          key: 'Escape',
          run: () => {
            this.cancelInlineTextEdit();
            return true;
          },
        },
        {
          key: 'Tab',
          run: (view) => {
            view.dispatch(view.state.replaceSelection('    '));
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.lineWrapping,
      createLivePreviewPlugin(),
    ];

    const extensions: Extension[] = [...coreExtensions];
    if (mathLanguageExtension) {
      extensions.push(mathLanguageExtension);
    }
    if (latexsSuitePlugin?.editorExtensions) {
      extensions.push(latexsSuitePlugin.editorExtensions);
    }

    if (this.activeInlineEditor) {
      this.activeInlineEditor.destroy();
      this.activeInlineEditor = null;
    }

    try {
      this.activeInlineEditor = new EditorView({
        state: EditorState.create({
          doc: rawText,
          extensions,
        }),
        parent: wrap,
      });
    } catch (err) {
      console.warn('[circuit] Failed with external extensions, falling back to core extensions:', err);
      this.activeInlineEditor = new EditorView({
        state: EditorState.create({
          doc: rawText,
          extensions: coreExtensions,
        }),
        parent: wrap,
      });
    }

    wrap.setAttribute('title', 'Ctrl+Invio per salvare • Esc per annullare');

    const footer = wrap.createDiv({ cls: 'circuit-inline-editor-footer' });
    footer.createSpan({
      cls: 'circuit-inline-editor-tip',
      text: 'Ctrl+Invio per salvare',
    });

    const cancelBtn = footer.createEl('button', {
      cls: 'circuit-inline-editor-btn-cancel',
      text: 'Annulla',
      attr: { type: 'button', title: 'Annulla modifiche (Esc)' },
    });
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cancelInlineTextEdit();
    });

    const saveBtn = footer.createEl('button', {
      cls: 'circuit-inline-editor-btn-save',
      text: 'Salva',
      attr: { type: 'button', title: 'Salva testo nel circuito (Ctrl+Invio)' },
    });
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.finishInlineTextEdit();
    });

    window.setTimeout(() => {
      if (this.activeInlineEditor) {
        this.activeInlineEditor.focus();
        // Re-center now that the editor has its final dimensions
        this.updateInlineEditorPosition();
      }
    }, 20);
  }

  private updateInlineEditorPosition(): void {
    if (!this.inlineEditorOverlayEl || !this.editingTextComponentId) return;
    const comp = this.data.components?.find((c) => c.id === this.editingTextComponentId);
    if (!comp) return;
    const screenX = Math.round(this.pan.x + comp.x * this.zoom);
    const screenY = Math.round(this.pan.y + comp.y * this.zoom);
    // Center the overlay on the component position without CSS transform
    const rect = this.inlineEditorOverlayEl.getBoundingClientRect();
    const halfW = rect.width > 0 ? Math.round(rect.width / 2) : 140;
    const halfH = rect.height > 0 ? Math.round(rect.height / 2) : 40;
    this.inlineEditorOverlayEl.style.left = `${screenX - halfW}px`;
    this.inlineEditorOverlayEl.style.top = `${screenY - halfH}px`;
  }

  private getPin(pinId: string): PinInfo | null {
    for (const comp of this.data.components || []) {
      const pin = getComponentPins(comp).find((item) => item.pinId === pinId);
      if (pin) return pin;
    }
    return null;
  }

  private getPinAt(point: Point): PinInfo | null {
    const tolerance = 18;
    let nearestPin: PinInfo | null = null;
    let nearestDistance = tolerance;

    for (const comp of this.data.components || []) {
      for (const pin of getComponentPins(comp)) {
        const distance = Math.hypot(pin.point.x - point.x, pin.point.y - point.y);
        if (distance <= nearestDistance) {
          nearestPin = pin;
          nearestDistance = distance;
        }
      }
    }
    return nearestPin;
  }

  private getWireIndexAt(point: Point, excludePinId?: string): number | null {
    if (!this.data.connections) return null;
    const pinCoords = buildPinMap(this.data.components || []);
    const tolerance = 16;

    for (let i = 0; i < this.data.connections.length; i++) {
      const conn = this.data.connections[i];
      if (excludePinId && (conn.from === excludePinId || conn.to === excludePinId)) {
        continue;
      }
      const p1 = pinCoords.get(conn.from);
      const p2 = pinCoords.get(conn.to);
      if (!p1 || !p2) continue;

      const fromComp = this.data.components?.find((c) => conn.from.startsWith(c.id));
      const res = getClosestPointOnWire(point, p1, p2, fromComp, conn.waypoints);
      if (res.distance <= tolerance) {
        return i;
      }
    }
    return null;
  }

  private addConnection(from: PinInfo, to: PinInfo): void {
    if (from.componentId === to.componentId) {
      this.wiringSourcePin = null;
      this.hoveredPinId = null;
      return;
    }

    if (!this.data.connections) this.data.connections = [];

    if (
      this.data.connections.some(
        (connection) =>
          (connection.from === from.pinId && connection.to === to.pinId) ||
          (connection.from === to.pinId && connection.to === from.pinId)
      )
    ) {
      this.wiringSourcePin = null;
      this.hoveredPinId = null;
      return;
    }

    this.data.connections.push({ from: from.pinId, to: to.pinId });
    this.wiringSourcePin = null;
    this.hoveredPinId = null;
  }

  private addComponent(type: ComponentType, x: number, y: number, rotation = 0): CircuitComponent {
    if (!this.data.components) {
      this.data.components = [];
    }

    const id = this.generateNextId(type);
    const newComp: CircuitComponent = {
      id,
      type,
      x,
      y,
      rotation,
      label: id,
      value: this.getDefaultValue(type),
      text: type === 'text' ? '$V_{in}(t) = 10\\text{V}$' : undefined,
      fontSize: type === 'text' ? 13 : undefined,
    };

    this.data.components.push(newComp);
    this.selectedComponentId = id;
    this.callbacks.onSelectionChange('component');
    this.callbacks.onDataChange();
    return newComp;
  }

  private addLoop(x: number, y: number): void {
    if (!this.data.loops) {
      this.data.loops = [];
    }

    let count = 1;
    while (this.data.loops.some((l) => l.id === `M${count}`)) {
      count++;
    }
    const id = `M${count}`;

    const newLoop: CircuitLoop = {
      id,
      label: id,
      value: '∑V = 0',
      x,
      y,
      radius: 24,
      direction: 'cw',
    };

    this.data.loops.push(newLoop);
    this.selectedLoopId = id;
    this.callbacks.onSelectionChange('loop');
    this.callbacks.onDataChange();
  }

  private generateNextId(type: ComponentType): string {
    const prefixMap: Record<ComponentType, string> = {
      resistor: 'R',
      capacitor: 'C',
      inductor: 'L',
      diode: 'D',
      dc_source: 'V',
      ac_source: 'VAC',
      current_source: 'I',
      vcvs: 'E',
      ccvs: 'H',
      vccs: 'G',
      cccs: 'F',
      switch_open: 'SW',
      switch_closed: 'SW',
      switch_spdt: 'SPDT',
      ground: 'GND',
      junction: 'J',
      text: 'TXT',
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
      case 'current_source':
        return '2A';
      case 'vcvs':
        return 'α = 2';
      case 'ccvs':
        return 'rm = 50Ω';
      case 'vccs':
        return 'gm = 10mS';
      case 'cccs':
        return 'β = 100';
      case 'text':
        return '$V_{in}(t) = 10\\text{V}$';
      case 'switch_open':
      case 'switch_closed':
      case 'switch_spdt':
      case 'ground':
      case 'junction':
        return undefined;
      case 'diode':
        return undefined;
    }
  }

  private getSvgCoordinates(evt: MouseEvent): Point {
    const rect = this.svgEl.getBoundingClientRect();
    const mx = evt.clientX - rect.left;
    const my = evt.clientY - rect.top;
    return {
      x: Math.round((mx - this.pan.x) / this.zoom),
      y: Math.round((my - this.pan.y) / this.zoom),
    };
  }

  // Camera & View Navigation Controls
  private createCanvasControls(): void {
    if (this.controlsEl) {
      this.controlsEl.remove();
    }

    this.controlsEl = this.containerEl.createDiv({ cls: 'circuit-canvas-controls' });

    const zoomOutBtn = this.controlsEl.createEl('button', {
      cls: 'circuit-canvas-ctrl-btn',
      attr: { type: 'button', title: 'Zoom Out (-)' },
    });
    setIcon(zoomOutBtn, 'minus');
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = this.svgEl.getBoundingClientRect();
      this.zoomAt(rect.width / 2, rect.height / 2, 0.85);
    });

    this.zoomLabelEl = this.controlsEl.createEl('button', {
      cls: 'circuit-canvas-ctrl-btn circuit-zoom-label',
      text: `${Math.round(this.zoom * 100)}%`,
      attr: { type: 'button', title: 'Ripristina zoom al 100%' },
    });
    this.zoomLabelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetZoom();
    });

    const zoomInBtn = this.controlsEl.createEl('button', {
      cls: 'circuit-canvas-ctrl-btn',
      attr: { type: 'button', title: 'Zoom In (+)' },
    });
    setIcon(zoomInBtn, 'plus');
    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = this.svgEl.getBoundingClientRect();
      this.zoomAt(rect.width / 2, rect.height / 2, 1.18);
    });

    const fitBtn = this.controlsEl.createEl('button', {
      cls: 'circuit-canvas-ctrl-btn',
      attr: { type: 'button', title: 'Adatta vista a tutti i componenti' },
    });
    setIcon(fitBtn, 'scan');
    fitBtn.createSpan({ text: 'Adatta' });
    fitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fitView();
    });

    const saveViewBtn = this.controlsEl.createEl('button', {
      cls: 'circuit-canvas-ctrl-btn circuit-save-view-btn',
      attr: { type: 'button', title: 'Salva inquadratura corrente nel documento' },
    });
    setIcon(saveViewBtn, 'camera');
    saveViewBtn.createSpan({ text: 'Salva vista' });
    saveViewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveView();
    });
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const rect = this.svgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    this.zoomAt(mx, my, factor);
  }

  zoomAt(mx: number, my: number, factor: number): void {
    const worldX = (mx - this.pan.x) / this.zoom;
    const worldY = (my - this.pan.y) / this.zoom;
    const newZoom = Math.max(0.2, Math.min(4.0, this.zoom * factor));
    this.pan.x = Math.round(mx - worldX * newZoom);
    this.pan.y = Math.round(my - worldY * newZoom);
    this.zoom = Number(newZoom.toFixed(2));
    this.updateViewportTransform();
  }

  resetZoom(): void {
    const rect = this.svgEl.getBoundingClientRect();
    const cWidth = rect.width > 50 ? rect.width : 600;
    const cHeight = rect.height > 50 ? rect.height : 400;

    const worldCenterX = (cWidth / 2 - this.pan.x) / this.zoom;
    const worldCenterY = (cHeight / 2 - this.pan.y) / this.zoom;

    this.zoom = 1.0;
    this.pan.x = Math.round(cWidth / 2 - worldCenterX);
    this.pan.y = Math.round(cHeight / 2 - worldCenterY);
    this.updateViewportTransform();
  }

  fitView(): void {
    const comps = this.data.components || [];
    if (comps.length === 0) {
      this.pan = { x: 50, y: 50 };
      this.zoom = 1.0;
      this.updateViewportTransform();
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const comp of comps) {
      minX = Math.min(minX, comp.x - 40);
      minY = Math.min(minY, comp.y - 40);
      maxX = Math.max(maxX, comp.x + 40);
      maxY = Math.max(maxY, comp.y + 40);
    }

    const rect = this.svgEl.getBoundingClientRect();
    const cWidth = rect.width > 50 ? rect.width : 600;
    const cHeight = rect.height > 50 ? rect.height : 400;

    const bWidth = Math.max(80, maxX - minX + 80);
    const bHeight = Math.max(80, maxY - minY + 80);

    const newZoom = Math.max(0.2, Math.min(2.0, Math.min(cWidth / bWidth, cHeight / bHeight)));
    const panX = (cWidth - (minX + maxX) * newZoom) / 2;
    const panY = (cHeight - (minY + maxY) * newZoom) / 2;

    this.zoom = Number(newZoom.toFixed(2));
    this.pan = { x: Math.round(panX), y: Math.round(panY) };
    this.updateViewportTransform();
  }

  saveView(): void {
    const rect = this.svgEl.getBoundingClientRect();
    const cWidth = rect.width > 50 ? Math.round(rect.width) : (this.data.width || 600);
    const cHeight = rect.height > 50 ? Math.round(rect.height) : 400;

    // In modal, rect.height is large (e.g. 636-800px). Preserve or cap the embedded height
    // so it doesn't create huge vertical voids in the note.
    const embeddedHeight = this.data.height && this.data.height >= 200 && this.data.height <= 460
      ? this.data.height
      : 380;

    // Convert modal-centered camera to embedded note camera
    const modalCenterX = cWidth / 2;
    const modalCenterY = cHeight / 2;
    const worldCenterX = (modalCenterX - this.pan.x) / this.zoom;
    const worldCenterY = (modalCenterY - this.pan.y) / this.zoom;

    const noteWidth = this.data.width && this.data.width <= 800 ? this.data.width : 600;
    const notePanX = Math.round(noteWidth / 2 - worldCenterX * this.zoom);
    const notePanY = Math.round(embeddedHeight / 2 - worldCenterY * this.zoom);

    const minX = Math.round((0 - notePanX) / this.zoom);
    const minY = Math.round((0 - notePanY) / this.zoom);
    const vWidth = Math.round(noteWidth / this.zoom);
    const vHeight = Math.round(embeddedHeight / this.zoom);

    this.data.panX = notePanX;
    this.data.panY = notePanY;
    this.data.zoom = Number(this.zoom.toFixed(2));
    this.data.width = noteWidth;
    this.data.height = embeddedHeight;
    this.data.viewBox = `${minX} ${minY} ${vWidth} ${vHeight}`;

    this.callbacks.onDataChange();
    new Notice('Vista del circuito salvata!');
  }

  private updateViewportTransform(): void {
    if (this.viewportG) {
      this.viewportG.setAttribute(
        'transform',
        `translate(${this.pan.x}, ${this.pan.y}) scale(${this.zoom})`
      );
    }
    if (this.zoomLabelEl) {
      this.zoomLabelEl.setText(`${Math.round(this.zoom * 100)}%`);
    }
    this.updateInlineEditorPosition();
  }

  destroy(): void {
    if (this.onKeyDownHandler) {
      window.removeEventListener('keydown', this.onKeyDownHandler);
      this.onKeyDownHandler = null;
    }
    if (this.onKeyUpHandler) {
      window.removeEventListener('keyup', this.onKeyUpHandler);
      this.onKeyUpHandler = null;
    }
    if (this.onWheelHandler) {
      this.svgEl.removeEventListener('wheel', this.onWheelHandler);
      this.onWheelHandler = null;
    }
    if (this.activeInlineEditor) {
      this.activeInlineEditor.destroy();
      this.activeInlineEditor = null;
    }
    if (this.inlineEditorOverlayEl) {
      this.inlineEditorOverlayEl.remove();
      this.inlineEditorOverlayEl = null;
    }
  }
}