import { App, Modal, Setting } from 'obsidian';
import { CircuitComponent } from '../types';

export class ComponentPropertiesModal extends Modal {
  private comp: CircuitComponent;
  private onSave: (updated: CircuitComponent) => void;

  constructor(app: App, comp: CircuitComponent, onSave: (updated: CircuitComponent) => void) {
    super(app);
    this.comp = { ...comp };
    this.onSave = onSave;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: `Edit Component (${this.comp.type})` });

    new Setting(contentEl)
      .setName('ID')
      .setDesc('Unique identifier for connections')
      .addText((text) => {
        text.setValue(this.comp.id).onChange((val) => {
          this.comp.id = val.trim();
        });
      });

    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display label (e.g. R1, V_in)')
      .addText((text) => {
        text.setValue(this.comp.label || '').onChange((val) => {
          this.comp.label = val;
        });
      });

    new Setting(contentEl)
      .setName('Value')
      .setDesc('Component electrical value (e.g. 1kΩ, 100nF, 12V)')
      .addText((text) => {
        text.setValue(this.comp.value || '').onChange((val) => {
          this.comp.value = val;
        });
      });

    new Setting(contentEl)
      .setName('Rotation')
      .setDesc('Component angle')
      .addDropdown((drop) => {
        drop
          .addOption('0', '0° (Horizontal)')
          .addOption('90', '90° (Vertical)')
          .addOption('180', '180° (Inverted Horizontal)')
          .addOption('270', '270° (Inverted Vertical)')
          .setValue(String(this.comp.rotation || 0))
          .onChange((val) => {
            this.comp.rotation = parseInt(val, 10);
          });
      });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText('Save')
          .setCta()
          .onClick(() => {
            this.onSave(this.comp);
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
