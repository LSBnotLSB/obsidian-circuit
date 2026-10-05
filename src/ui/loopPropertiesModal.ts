import { App, Modal, Setting } from 'obsidian';
import { CircuitLoop } from '../types';

export class LoopPropertiesModal extends Modal {
  private loop: CircuitLoop;
  private onSave: (updated: CircuitLoop) => void;

  constructor(app: App, loop: CircuitLoop, onSave: (updated: CircuitLoop) => void) {
    super(app);
    this.loop = { ...loop };
    this.onSave = onSave;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: `Edit Mesh Loop (${this.loop.label})` });

    new Setting(contentEl)
      .setName('Loop ID')
      .setDesc('Identifier for this loop')
      .addText((text) => {
        text.setValue(this.loop.id).onChange((val) => {
          this.loop.id = val.trim();
        });
      });

    new Setting(contentEl)
      .setName('Loop label')
      .setDesc('Name displayed inside loop circle (e.g. M1, I_A)')
      .addText((text) => {
        text.setValue(this.loop.label || '').onChange((val) => {
          this.loop.label = val.trim();
        });
      });

    new Setting(contentEl)
      .setName('Voltage equation / value')
      .setDesc('Mesh equation or voltage label (e.g. ∑V = 0, V1 - VR1 - VR2 = 0)')
      .addText((text) => {
        text
          .setPlaceholder('∑V = 0')
          .setValue(this.loop.value || '')
          .onChange((val) => {
            this.loop.value = val.trim() || undefined;
          });
      });

    new Setting(contentEl)
      .setName('Loop orientation')
      .setDesc('Direction of the loop circular arrow')
      .addDropdown((drop) => {
        drop
          .addOption('cw', 'Clockwise (↻ Orario)')
          .addOption('ccw', 'Counter-Clockwise (↺ Antiorario)')
          .setValue(this.loop.direction || 'cw')
          .onChange((val) => {
            this.loop.direction = val as 'cw' | 'ccw';
          });
      });

    new Setting(contentEl)
      .setName('Radius')
      .setDesc('Size of the mesh loop indicator')
      .addSlider((slider) => {
        slider
          .setLimits(16, 48, 2)
          .setValue(this.loop.radius || 24)
          .onChange((val) => {
            this.loop.radius = val;
          });
      });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText('Save')
          .setCta()
          .onClick(() => {
            this.onSave(this.loop);
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
