import { ComponentType, EditorTool } from '../types';

export interface ToolbarCallbacks {
  onSelectTool: (tool: EditorTool) => void;
  onRotate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleGrid: () => void;
  onClear: () => void;
}

const COMPONENT_BUTTONS: { type: ComponentType; label: string; icon: string }[] = [
  { type: 'resistor', label: 'Resistor', icon: 'R' },
  { type: 'capacitor', label: 'Capacitor', icon: 'C' },
  { type: 'inductor', label: 'Inductor', icon: 'L' },
  { type: 'dc_source', label: 'DC Source', icon: 'V (DC)' },
  { type: 'ac_source', label: 'AC Source', icon: 'V (AC)' },
  { type: 'diode', label: 'Diode', icon: 'D' },
  { type: 'ground', label: 'Ground', icon: 'GND' },
];

export class CircuitToolbar {
  private containerEl: HTMLElement;
  private callbacks: ToolbarCallbacks;
  private activeTool: EditorTool = 'select';
  private toolButtons = new Map<EditorTool, HTMLButtonElement>();
  private rotateBtn: HTMLButtonElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;

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
  }

  setHasSelection(hasSelection: boolean): void {
    if (this.rotateBtn) {
      this.rotateBtn.disabled = !hasSelection;
    }
    if (this.deleteBtn) {
      this.deleteBtn.disabled = !hasSelection;
    }
  }

  private render(): void {
    this.containerEl.empty();
    this.toolButtons.clear();

    // Tools Group: Select / Move
    const toolsGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });
    const selectBtn = toolsGroup.createEl('button', {
      cls: 'circuit-toolbar-btn is-active',
      text: '👆 Select',
      attr: { title: 'Select, move and wire components' },
    });
    selectBtn.onclick = () => {
      this.callbacks.onSelectTool('select');
    };
    this.toolButtons.set('select', selectBtn);

    // Component Palette Group
    const compGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });
    compGroup.createSpan({ text: 'Add:', cls: 'circuit-toolbar-label' });

    for (const item of COMPONENT_BUTTONS) {
      const btn = compGroup.createEl('button', {
        cls: 'circuit-toolbar-btn',
        text: item.icon,
        attr: { title: `Add ${item.label}` },
      });
      btn.onclick = () => {
        this.callbacks.onSelectTool(item.type);
      };
      this.toolButtons.set(item.type, btn);
    }

    // Actions Group: Rotate, Delete
    const actionsGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });

    this.rotateBtn = actionsGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      text: '🔄 Rotate (R)',
      attr: { title: 'Rotate selected component 90° (Hotkey: R)' },
    });
    this.rotateBtn.disabled = true;
    this.rotateBtn.onclick = () => {
      this.callbacks.onRotate();
    };

    this.deleteBtn = actionsGroup.createEl('button', {
      cls: 'circuit-toolbar-btn circuit-btn-danger',
      text: '🗑️ Delete (Del)',
      attr: { title: 'Delete selected component or wire (Hotkey: Del / Backspace)' },
    });
    this.deleteBtn.disabled = true;
    this.deleteBtn.onclick = () => {
      this.callbacks.onDelete();
    };

    // History and Canvas Group
    const miscGroup = this.containerEl.createDiv({ cls: 'circuit-toolbar-group' });

    const undoBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      text: '↩️ Undo',
      attr: { title: 'Undo (Ctrl+Z)' },
    });
    undoBtn.onclick = () => {
      this.callbacks.onUndo();
    };

    const redoBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      text: '↪️ Redo',
      attr: { title: 'Redo (Ctrl+Y)' },
    });
    redoBtn.onclick = () => {
      this.callbacks.onRedo();
    };

    const gridBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn',
      text: '🔲 Grid',
      attr: { title: 'Toggle grid' },
    });
    gridBtn.onclick = () => {
      this.callbacks.onToggleGrid();
    };

    const clearBtn = miscGroup.createEl('button', {
      cls: 'circuit-toolbar-btn circuit-btn-subtle',
      text: '🧹 Clear',
      attr: { title: 'Clear circuit' },
    });
    clearBtn.onclick = () => {
      this.callbacks.onClear();
    };
  }
}
