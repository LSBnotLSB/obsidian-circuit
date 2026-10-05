import { App, Modal, Setting } from 'obsidian';
import { CircuitComponent, SignConvention } from '../types';

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
      .setDesc('Display label (e.g. R1, V_in, M1)')
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
      .setName('Sign convention')
      .setDesc('Display terminal polarities (+/−) and current direction arrow')
      .addDropdown((drop) => {
        drop
          .addOption('none', 'None')
          .addOption('passive', 'Utilizzatore (passive: current enters +)')
          .addOption('active', 'Generatore (active: current leaves +)')
          .setValue(this.comp.convention || 'none')
          .onChange((val) => {
            this.comp.convention = val as SignConvention;
          });
      });

    new Setting(contentEl)
      .setName('Current intensity / label')
      .setDesc('Current text displayed on arrow (e.g. i(t), 2A)')
      .addText((text) => {
        text.setValue(this.comp.currentLabel || '').onChange((val) => {
          this.comp.currentLabel = val;
        });
      });

    new Setting(contentEl)
      .setName('Terminal voltage label')
      .setDesc('Voltage text displayed near terminals (e.g. v(t), 12V)')
      .addText((text) => {
        text.setValue(this.comp.voltageLabel || '').onChange((val) => {
          this.comp.voltageLabel = val;
        });
      });

    if (
      this.comp.type === 'vcvs' ||
      this.comp.type === 'ccvs' ||
      this.comp.type === 'vccs' ||
      this.comp.type === 'cccs'
    ) {
      new Setting(contentEl)
        .setName('Control formula')
        .setDesc('Gain / dependency relationship (e.g. v = α·vp, i = gm·vp)')
        .addText((text) => {
          text.setValue(this.comp.controlFormula || '').onChange((val) => {
            this.comp.controlFormula = val;
          });
        });
    }

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
