import { App, Modal } from 'obsidian';
import { CircuitComponent, CircuitData, EditorTool } from '../types';
import { CircuitCanvas } from './circuitCanvas';
import { CircuitToolbar } from './circuitToolbar';
import { ComponentPropertiesModal } from './componentPropertiesModal';

export class CircuitModal extends Modal {
  private data: CircuitData;
  private onSave: (savedData: CircuitData) => void;

  private canvas: CircuitCanvas | null = null;
  private toolbar: CircuitToolbar | null = null;

  // History stack for Undo / Redo
  private history: string[] = [];
  private future: string[] = [];
  private readonly maxHistory = 30;

  constructor(app: App, initialData: CircuitData, onSave: (savedData: CircuitData) => void) {
    super(app);
    // Deep copy initial data
    this.data = JSON.parse(JSON.stringify(initialData)) as CircuitData;
    if (!this.data.components) this.data.components = [];
    if (!this.data.connections) this.data.connections = [];
    this.onSave = onSave;
    this.pushHistory();
  }

  override onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass('circuit-editor-modal');

    // Header
    const headerEl = contentEl.createDiv({ cls: 'circuit-editor-header' });
    headerEl.createEl('h2', { text: 'Circuit schematic editor' });
    headerEl.createEl('p', {
      cls: 'circuit-editor-subtitle',
      text: 'Click component in toolbar to place • Click pins to connect wires • Press R to rotate • Double-click to edit',
    });

    // Toolbar Container
    this.toolbar = new CircuitToolbar(contentEl, {
      onSelectTool: (tool: EditorTool) => {
        this.canvas?.setTool(tool);
        this.toolbar?.setActiveTool(tool);
      },
      onRotate: () => {
        this.canvas?.rotateSelected();
      },
      onDelete: () => {
        this.canvas?.deleteSelected();
      },
      onUndo: () => {
        this.undo();
      },
      onRedo: () => {
        this.redo();
      },
      onToggleGrid: () => {
        this.data.grid = this.data.grid === false ? true : false;
        this.canvas?.setData(this.data);
      },
      onClear: () => {
        this.data.components = [];
        this.data.connections = [];
        this.pushHistory();
        this.canvas?.setData(this.data);
      },
    });

    // Canvas Container
    this.canvas = new CircuitCanvas(contentEl, this.data, {
      onSelectionChange: (hasSelection: boolean) => {
        this.toolbar?.setHasSelection(hasSelection);
      },
      onEditComponent: (comp: CircuitComponent) => {
        new ComponentPropertiesModal(this.app, comp, (updated) => {
          this.canvas?.updateComponent(updated);
        }).open();
      },
      onDataChange: () => {
        this.pushHistory();
      },
    });

    // Footer actions
    const footerEl = contentEl.createDiv({ cls: 'circuit-editor-footer' });

    const infoSpan = footerEl.createSpan({ cls: 'circuit-footer-info' });
    this.updateFooterInfo(infoSpan);

    const btnGroup = footerEl.createDiv({ cls: 'circuit-footer-buttons' });

    const cancelBtn = btnGroup.createEl('button', {
      text: 'Cancel',
      cls: 'mod-cancel',
    });
    cancelBtn.onclick = () => {
      this.close();
    };

    const saveBtn = btnGroup.createEl('button', {
      text: 'Save to note',
      cls: 'mod-cta',
    });
    saveBtn.onclick = () => {
      this.onSave(this.data);
      this.close();
    };

    // Keyboard Shortcuts
    this.bindKeyboardShortcuts();
  }

  override onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.canvas = null;
    this.toolbar = null;
  }

  private pushHistory(): void {
    const snapshot = JSON.stringify(this.data);
    if (this.history.length === 0 || this.history[this.history.length - 1] !== snapshot) {
      this.history.push(snapshot);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.future = [];
    }
  }

  private undo(): void {
    if (this.history.length > 1) {
      const current = this.history.pop();
      if (current) {
        this.future.push(current);
      }
      const previous = this.history[this.history.length - 1];
      if (previous) {
        this.data = JSON.parse(previous) as CircuitData;
        this.canvas?.setData(this.data);
      }
    }
  }

  private redo(): void {
    if (this.future.length > 0) {
      const next = this.future.pop();
      if (next) {
        this.history.push(next);
        this.data = JSON.parse(next) as CircuitData;
        this.canvas?.setData(this.data);
      }
    }
  }

  private updateFooterInfo(infoEl: HTMLElement): void {
    const compCount = this.data.components?.length || 0;
    const connCount = this.data.connections?.length || 0;
    infoEl.setText(`${compCount} components, ${connCount} connections`);
  }

  private bindKeyboardShortcuts(): void {
    this.scope.register([], 'r', () => {
      this.canvas?.rotateSelected();
      return false;
    });

    this.scope.register([], 'Delete', () => {
      this.canvas?.deleteSelected();
      return false;
    });

    this.scope.register([], 'Backspace', () => {
      this.canvas?.deleteSelected();
      return false;
    });

    this.scope.register(['Mod'], 'z', () => {
      this.undo();
      return false;
    });

    this.scope.register(['Mod'], 'y', () => {
      this.redo();
      return false;
    });

    this.scope.register(['Mod', 'Shift'], 'z', () => {
      this.redo();
      return false;
    });

    this.scope.register(['Mod'], 's', () => {
      this.onSave(this.data);
      this.close();
      return false;
    });
  }
}
