import { App, Modal, Setting } from 'obsidian';
import { CircuitConnection } from '../types';

export class ConnectionPropertiesModal extends Modal {
  private conn: CircuitConnection;
  private onSave: (updated: CircuitConnection) => void;

  constructor(app: App, conn: CircuitConnection, onSave: (updated: CircuitConnection) => void) {
    super(app);
    this.conn = { ...conn };
    this.onSave = onSave;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: `Edit Connection (${this.conn.from} → ${this.conn.to})` });

    new Setting(contentEl)
      .setName('Current intensity')
      .setDesc('Current flowing through this wire branch (e.g. 2A, i1, 50mA)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. 2A')
          .setValue(this.conn.current || '')
          .onChange((val) => {
            this.conn.current = val.trim() || undefined;
          });
      });

    new Setting(contentEl)
      .setName('Current flow direction')
      .setDesc('Direction of the current arrow along the wire')
      .addDropdown((drop) => {
        drop
          .addOption('forward', `Forward (${this.conn.from} → ${this.conn.to})`)
          .addOption('backward', `Backward (${this.conn.to} → ${this.conn.from})`)
          .setValue(this.conn.currentDirection || 'forward')
          .onChange((val) => {
            this.conn.currentDirection = val as 'forward' | 'backward';
          });
      });

    new Setting(contentEl)
      .setName('Wire color')
      .setDesc('Custom color for this wire (leave blank for theme accent)')
      .addText((text) => {
        text
          .setPlaceholder('var(--text-accent) or #e63946')
          .setValue(this.conn.color || '')
          .onChange((val) => {
            this.conn.color = val.trim() || undefined;
          });
      });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText('Save')
          .setCta()
          .onClick(() => {
            this.onSave(this.conn);
            this.close();
          });
      })
      .addButton((btn) => {
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        });
      });
  }

  override onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

