import { setIcon, setTooltip } from 'obsidian';
import { ComponentType, EditorTool, SelectionType } from '../types';
import { drawComponentMiniatureSVG } from '../utils/drawSymbols';

export interface ToolbarCallbacks {
  onSelectTool: (tool: EditorTool) => void;
  onRotate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleGrid: () => void;
  onClear: () => void;
  onSaveView?: () => void;
  onFitView?: () => void;
}

interface ComponentButtonDef {
  type: ComponentType | 'loop';
  label: string;
}

interface ComponentCategory {
  name: string;
  items: ComponentButtonDef[];
}

const CATEGORIES: ComponentCategory[] = [
  {
    name: 'Passivi',
    items: [
      { type: 'resistor', label: 'Resistore (R)' },
      { type: 'capacitor', label: 'Condensatore (C)' },
      { type: 'inductor', label: 'Induttore (L)' },
      { type: 'memristor', label: 'Memristor (R)' },
      { type: 'diode', label: 'Diodo (D)' },
    ],
  },
  {
    name: 'Sorgenti',
    items: [
      { type: 'dc_source', label: 'Generatore di tensione DC (V)' },
      { type: 'ac_source', label: 'Generatore di tensione AC (VAC)' },
      { type: 'current_source', label: 'Generatore indipendente di corrente (I)' },
    ],
  },
  {
    name: 'Dipendenti',
    items: [
      { type: 'vcvs', label: 'VCVS: Tensione controllata in tensione (v = α·vp)' },
      { type: 'ccvs', label: 'CCVS: Tensione controllata in corrente (v = rm·ip)' },
      { type: 'vccs', label: 'VCCS: Corrente controllata in tensione (i = gm·vp)' },
      { type: 'cccs', label: 'CCCS: Corrente controllata in corrente (i = β·ip)' },
    ],
  },
  {
    name: 'Interruttori & Altri',
    items: [
      { type: 'switch_open', label: 'Interruttore aperto (t = 0)' },
      { type: 'switch_closed', label: 'Interruttore chiuso (t = 0)' },
      { type: 'switch_spdt', label: 'Deviatore SPDT (2 vie)' },
      { type: 'ground', label: 'Massa di riferimento (GND)' },
      { type: 'junction', label: 'Nodo di giunzione (•)' },
      { type: 'loop', label: 'Maglia di tensione (↻ KVL)' },
      { type: 'text', label: 'Testo & Formula LaTeX ($...$)' },
    ],
  },
];

export class CircuitToolbar {
  private containerEl: HTMLElement;
  private callbacks: ToolbarCallbacks;
  private activeTool: EditorTool = 'select';
  private toolButtons = new Map<EditorTool, HTMLButtonElement>();
  private rotateBtn: HTMLButtonElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;
  private gridBtn: HTMLButtonElement | null = null;
  private selectionType: SelectionType = 'none';

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.containerEl = parentEl.createDiv({ cls: 'circuit-editor-toolbar' });
    this.callbacks = callbacks;
    this.render();
  }

  setActiveTool(tool: EditorTool): void {
    this.activeTool = tool;
    for (const [t, btn] of this.toolButtons) {
      if (t === tool) {
        btn.addClass('is-active');
      } else {
        btn.removeClass('is-active');
      }
    }
    this.updateRotateBtn();
  }

  setSelectionState(type: SelectionType): void {
    this.selectionType = type;
    this.updateRotateBtn();
    if (this.deleteBtn) {
      this.deleteBtn.disabled = type === 'none';
    }
  }

  private updateRotateBtn(): void {
    if (this.rotateBtn) {
      const isGhosting = this.activeTool !== 'select';
      const isSelectedRotatable = this.selectionType === 'component' || this.selectionType === 'loop';
      this.rotateBtn.disabled = !isGhosting && !isSelectedRotatable;
    }
  }

  setGridEnabled(enabled: boolean): void {
    if (this.gridBtn) {
      this.gridBtn.toggleClass('is-active', enabled);
      this.gridBtn.setAttribute('aria-pressed', String(enabled));
    }
  }

  private render(): void {
    this.containerEl.empty();
    this.toolButtons.clear();

    // Group 1: Select / Move
    const selectGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });
    const selectBtn = selectGroup.createEl('button', {
      cls: ['circuit-toolbar-btn', 'is-active'],
      attr: { type: 'button' },
    });
    setIcon(selectBtn, 'mouse-pointer');
    selectBtn.createSpan({ text: 'Select' });
    setTooltip(selectBtn, 'Select, move, and wire components (Hotkey: Escape)');
    selectBtn.addEventListener('click', () => {
      this.callbacks.onSelectTool('select');
    });
    this.toolButtons.set('select', selectBtn);

    // Group 2: Categorized Components with SVG icons
    for (const cat of CATEGORIES) {
      const groupEl = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });
      groupEl.createSpan({ text: `${cat.name}:`, cls: 'circuit-toolbar-label' });

      for (const item of cat.items) {
        const isText = item.type === 'text';
        const btn = groupEl.createEl('button', {
          cls: isText
            ? ['circuit-toolbar-btn', 'circuit-toolbar-text-btn']
            : ['circuit-toolbar-btn', 'circuit-toolbar-comp-btn'],
          attr: { type: 'button' },
        });

        if (isText) {
          btn.createSpan({ text: 'Text' });
        } else {
          // Miniature SVG vector schematic symbol
          drawComponentMiniatureSVG(btn, item.type);
        }

        // Native Obsidian tooltip on hover
        setTooltip(btn, item.label);

        btn.addEventListener('click', () => {
          this.callbacks.onSelectTool(item.type);
        });
        this.toolButtons.set(item.type, btn);
      }
    }

    // Group 3: Actions (Rotate, Delete)
    const actionsGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });

    this.rotateBtn = actionsGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      attr: { type: 'button' },
    });
    setIcon(this.rotateBtn, 'rotate-cw');
    this.rotateBtn.createSpan({ text: 'Rotate (R)' });
    setTooltip(this.rotateBtn, 'Rotate selected component 90° or flip orientation (Hotkey: R)');
    this.rotateBtn.disabled = true;
    this.rotateBtn.addEventListener('click', () => {
      this.callbacks.onRotate();
    });

    this.deleteBtn = actionsGroup.createEl('button', {
      cls: ['circuit-toolbar-btn', 'circuit-btn-danger'],
      attr: { type: 'button' },
    });
    setIcon(this.deleteBtn, 'trash-2');
    this.deleteBtn.createSpan({ text: 'Delete' });
    setTooltip(this.deleteBtn, 'Delete selected component, loop, or wire (Hotkey: Del / Backspace)');
    this.deleteBtn.disabled = true;
    this.deleteBtn.addEventListener('click', () => {
      this.callbacks.onDelete();
    });

    // Group 4: History & Canvas Misc
    const miscGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });

    const undoBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      attr: { type: 'button' },
    });
    setIcon(undoBtn, 'undo');
    setTooltip(undoBtn, 'Undo (Ctrl+Z)');
    undoBtn.addEventListener('click', () => {
      this.callbacks.onUndo();
    });

    const redoBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      attr: { type: 'button' },
    });
    setIcon(redoBtn, 'redo');
    setTooltip(redoBtn, 'Redo (Ctrl+Y)');
    redoBtn.addEventListener('click', () => {
      this.callbacks.onRedo();
    });

    this.gridBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      attr: { 'aria-pressed': 'false', type: 'button' },
    });
    setIcon(this.gridBtn, 'grid');
    this.gridBtn.createSpan({ text: 'Grid' });
    setTooltip(this.gridBtn, 'Toggle background grid snapping');
    this.gridBtn.addEventListener('click', () => {
      this.callbacks.onToggleGrid();
    });

    const clearBtn = miscGroup.createEl('button', {
      cls: ['circuit-toolbar-btn', 'circuit-btn-subtle'],
      attr: { type: 'button' },
    });
    setIcon(clearBtn, 'eraser');
    clearBtn.createSpan({ text: 'Clear' });
    setTooltip(clearBtn, 'Clear entire schematic');
    clearBtn.addEventListener('click', () => {
      this.callbacks.onClear();
    });

    if (this.callbacks.onFitView) {
      const fitBtn = miscGroup.createEl('button', {
        cls: 'circuit-toolbar-btn',
        attr: { type: 'button' },
      });
      setIcon(fitBtn, 'scan');
      fitBtn.createSpan({ text: 'Adatta' });
      setTooltip(fitBtn, 'Adatta vista a tutti i componenti');
      fitBtn.addEventListener('click', () => {
        this.callbacks.onFitView?.();
      });
    }

    if (this.callbacks.onSaveView) {
      const saveViewBtn = miscGroup.createEl('button', {
        cls: ['circuit-toolbar-btn', 'circuit-btn-accent'],
        attr: { type: 'button' },
      });
      setIcon(saveViewBtn, 'camera');
      saveViewBtn.createSpan({ text: 'Salva vista' });
      setTooltip(saveViewBtn, 'Salva la vista/inquadratura corrente nel documento');
      saveViewBtn.addEventListener('click', () => {
        this.callbacks.onSaveView?.();
      });
    }
  }
}
