import {
  Editor,
  MarkdownPostProcessorContext,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
} from 'obsidian';
import { CircuitData } from './types';
import { CircuitModal } from './ui/circuitModal';
import { drawComponentSymbol } from './utils/drawSymbols';
import { buildPinMap, generateWirePath } from './utils/geometry';

const DEFAULT_CIRCUIT_DATA: CircuitData = {
  width: 600,
  height: 400,
  grid: true,
  components: [
    { id: 'V1', type: 'dc_source', label: 'V1', value: '12V', x: 100, y: 200, rotation: 90 },
    { id: 'R1', type: 'resistor', label: 'R1', value: '1kΩ', x: 260, y: 100, rotation: 0 },
    { id: 'C1', type: 'capacitor', label: 'C1', value: '100nF', x: 420, y: 200, rotation: 90 },
    { id: 'GND1', type: 'ground', label: 'GND', x: 260, y: 300, rotation: 0 },
  ],
  connections: [
    { from: 'V1.p1', to: 'R1.p1' },
    { from: 'R1.p2', to: 'C1.p1' },
    { from: 'V1.p2', to: 'GND1.in' },
    { from: 'C1.p2', to: 'GND1.in' },
  ],
};

export default class CircuitRendererPlugin extends Plugin {
  override onload(): void {
    // Register Code Block Processor
    this.registerMarkdownCodeBlockProcessor(
      'circuit-json',
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        let data: CircuitData;
        try {
          data = JSON.parse(source) as CircuitData;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const errorContainer = el.createDiv({ cls: 'circuit-error' });
          errorContainer.createSpan({ text: `Errore parsing JSON circuito: ${message}` });

          const editBtn = errorContainer.createEl('button', {
            cls: 'circuit-block-btn',
            text: '✏️ Open Visual Editor',
          });
          editBtn.onclick = () => {
            new CircuitModal(this.app, DEFAULT_CIRCUIT_DATA, (savedData) => {
              this.saveCircuitData(source, savedData, el, ctx);
            }).open();
          };
          return;
        }

        // Wrapper container for relative positioning of floating action toolbar
        const wrapper = el.createDiv({ cls: 'circuit-block-container' });

        // Floating action toolbar
        const toolbar = wrapper.createDiv({ cls: 'circuit-block-toolbar' });

        const editBtn = toolbar.createEl('button', {
          cls: 'circuit-block-btn',
          text: '✏️ Edit',
          attr: { title: 'Edit circuit in visual editor' },
        });
        editBtn.onclick = () => {
          new CircuitModal(this.app, data, (savedData) => {
            this.saveCircuitData(source, savedData, el, ctx);
          }).open();
        };

        const copyBtn = toolbar.createEl('button', {
          cls: 'circuit-block-btn',
          text: '📋 Copy',
          attr: { title: 'Copy JSON to clipboard' },
        });
        copyBtn.onclick = () => {
          void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
            new Notice('Circuit JSON copied to clipboard');
          });
        };

        // Render SVG schema
        const svgContainer = this.renderCircuitSVG(data);
        wrapper.appendChild(svgContainer);
      }
    );

    // Register Command to insert a new schematic
    this.addCommand({
      id: 'insert-schematic',
      name: 'Insert schematic',
      editorCallback: (editor: Editor) => {
        new CircuitModal(this.app, DEFAULT_CIRCUIT_DATA, (savedData) => {
          const jsonStr = JSON.stringify(savedData, null, 2);
          editor.replaceSelection(`\`\`\`circuit-json\n${jsonStr}\n\`\`\`\n`);
        }).open();
      },
    });
  }

  renderCircuitSVG(data: CircuitData): HTMLElement {
    const width = data.width || 600;
    const height = data.height || 400;

    const container = createDiv({ cls: 'circuit-container' });

    const svg = container.createSvg('svg', {
      cls: 'circuit-svg',
      attr: {
        width: String(width),
        height: String(height),
        viewBox: `0 0 ${width} ${height}`,
      },
    });

    // Optional grid
    if (data.grid) {
      const defs = svg.createSvg('defs');
      const pattern = defs.createSvg('pattern', {
        attr: {
          id: 'circuit-grid',
          width: '20',
          height: '20',
          patternUnits: 'userSpaceOnUse',
        },
      });
      pattern.createSvg('circle', {
        attr: {
          cx: '2',
          cy: '2',
          r: '1',
          fill: 'var(--text-faint)',
          opacity: '0.35',
        },
      });
      svg.createSvg('rect', {
        attr: {
          width: '100%',
          height: '100%',
          fill: 'url(#circuit-grid)',
        },
      });
    }

    const pinCoords = buildPinMap(data.components || []);

    // 1. Render components
    if (Array.isArray(data.components)) {
      for (const comp of data.components) {
        const rot = comp.rotation || 0;
        const g = svg.createSvg('g', {
          attr: {
            transform: `translate(${comp.x}, ${comp.y}) rotate(${rot})`,
            stroke: 'var(--text-normal)',
            'stroke-width': '2',
            fill: 'none',
          },
        });

        drawComponentSymbol(g, comp);
      }
    }

    // 2. Render connections with orthogonal routing
    if (Array.isArray(data.connections)) {
      for (const conn of data.connections) {
        const p1 = pinCoords.get(conn.from);
        const p2 = pinCoords.get(conn.to);
        if (!p1 || !p2) continue;

        const fromComp = data.components?.find((c) => conn.from.startsWith(c.id));
        const d = generateWirePath(p1, p2, fromComp, conn.waypoints);

        svg.createSvg('path', {
          attr: {
            d,
            stroke: conn.color || 'var(--text-accent)',
            'stroke-width': '2',
            fill: 'none',
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
          },
        });

        // Terminals / junctions
        for (const p of [p1, p2]) {
          svg.createSvg('circle', {
            attr: {
              cx: String(p.x),
              cy: String(p.y),
              r: '3',
              fill: 'var(--text-accent)',
            },
          });
        }
      }
    }

    return container;
  }

  private saveCircuitData(
    source: string,
    updatedData: CircuitData,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    const formattedJson = JSON.stringify(updatedData, null, 2);
    const newCodeBlock = `\`\`\`circuit-json\n${formattedJson}\n\`\`\``;

    const section = ctx.getSectionInfo(el);
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (section && activeView && activeView.editor) {
      const editor = activeView.editor;
      editor.replaceRange(
        newCodeBlock,
        { line: section.lineStart, ch: 0 },
        { line: section.lineEnd, ch: editor.getLine(section.lineEnd).length }
      );
      new Notice('Circuit updated in note');
      return;
    }

    // Fallback: Vault modification
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (file instanceof TFile) {
      void this.app.vault
        .process(file, (content) => {
          const rawOldBlock = `\`\`\`circuit-json\n${source.trim()}\n\`\`\``;
          if (content.includes(rawOldBlock)) {
            return content.replace(rawOldBlock, newCodeBlock);
          }
          if (content.includes(source)) {
            return content.replace(source, formattedJson);
          }
          return content;
        })
        .then(() => {
          new Notice('Circuit updated in note');
        });
    }
  }
}
