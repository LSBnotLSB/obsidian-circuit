import {
  Editor,
  MarkdownPostProcessorContext,
  MarkdownView,
  Notice,
  Plugin,
  setIcon,
  TFile,
} from 'obsidian';
import { CircuitData } from './types';
import { CircuitEmbeddedViewer } from './ui/circuitEmbeddedViewer';
import { CircuitModal } from './ui/circuitModal';

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
      'circuit',
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        el.addClass('circuit-codeblock-host');
        el.closest('.cm-embed-block')?.addClass('circuit-embed-block');
        let data: CircuitData;
        try {
          data = JSON.parse(source) as CircuitData;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const errorContainer = el.createDiv({ cls: 'circuit-error' });
          errorContainer.createSpan({ text: `Errore parsing JSON circuito: ${message}` });

          const editBtn = errorContainer.createEl('button', {
            cls: 'circuit-block-btn',
          });
          setIcon(editBtn, 'pencil');
          editBtn.createSpan({ text: 'Open Visual Editor' });
          editBtn.onclick = () => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const scrollInfo = this.captureScrollInfo(activeView);
            new CircuitModal(this.app, DEFAULT_CIRCUIT_DATA, (savedData) => {
              this.saveCircuitData(source, savedData, el, ctx, scrollInfo);
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
          attr: { title: 'Edit circuit in visual editor' },
        });
        setIcon(editBtn, 'pencil');
        editBtn.createSpan({ text: 'Edit' });
        editBtn.onclick = () => {
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          const scrollInfo = this.captureScrollInfo(activeView);
          new CircuitModal(this.app, data, (savedData) => {
            this.saveCircuitData(source, savedData, el, ctx, scrollInfo);
          }).open();
        };

        const copyBtn = toolbar.createEl('button', {
          cls: 'circuit-block-btn',
          attr: { title: 'Copy JSON to clipboard' },
        });
        setIcon(copyBtn, 'copy');
        copyBtn.createSpan({ text: 'Copy' });
        copyBtn.onclick = () => {
          void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
            new Notice('Circuit JSON copied to clipboard');
          });
        };

        // Render interactive embedded circuit viewer with navigation controls
        new CircuitEmbeddedViewer(
          wrapper,
          data,
          this.app,
          this,
          (updatedData) => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const scrollInfo = this.captureScrollInfo(activeView);
            this.saveCircuitData(source, updatedData, el, ctx, scrollInfo);
          }
        );
      }
    );

    // Register Command to insert a new schematic
    this.addCommand({
      id: 'insert-schematic',
      name: 'Insert schematic',
      editorCallback: (editor: Editor) => {
        new CircuitModal(this.app, DEFAULT_CIRCUIT_DATA, (savedData) => {
          const jsonStr = JSON.stringify(savedData, null, 2);
          editor.replaceSelection(`\`\`\`circuit\n${jsonStr}\n\`\`\`\n`);
        }).open();
      },
    });
  }

  renderCircuitSVG(data: CircuitData): HTMLElement {
    const tempDiv = createDiv();
    const viewer = new CircuitEmbeddedViewer(tempDiv, data, this.app, this);
    return viewer.getContainerEl();
  }

  private captureScrollInfo(view: MarkdownView | null): {
    subViewScroll: number | undefined;
    editorScroll: { top: number; left: number } | null;
    scrollerTop: number | undefined;
  } | null {
    if (!view) return null;
    const scroller = view.contentEl.querySelector<HTMLElement>(
      '.cm-scroller, .markdown-preview-view'
    );
    return {
      subViewScroll:
        typeof view.currentMode?.getScroll === 'function'
          ? view.currentMode.getScroll()
          : undefined,
      editorScroll: view.editor ? view.editor.getScrollInfo() : null,
      scrollerTop: scroller?.scrollTop,
    };
  }

  private saveCircuitData(
    source: string,
    updatedData: CircuitData,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    savedScrollInfo?: {
      subViewScroll: number | undefined;
      editorScroll: { top: number; left: number } | null;
      scrollerTop: number | undefined;
    } | null
  ): void {
    const formattedJson = JSON.stringify(updatedData, null, 2);
    const newCodeBlock = `\`\`\`circuit\n${formattedJson}\n\`\`\``;

    const section = ctx.getSectionInfo(el);
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    const restoreScroll = () => {
      if (!activeView) return;
      const targetSubViewScroll =
        savedScrollInfo?.subViewScroll ??
        (typeof activeView.currentMode?.getScroll === 'function'
          ? activeView.currentMode.getScroll()
          : undefined);
      const targetEditorScroll =
        savedScrollInfo?.editorScroll ??
        (activeView.editor ? activeView.editor.getScrollInfo() : null);
      const targetScrollerTop = savedScrollInfo?.scrollerTop;

      const scrollerEl = activeView.contentEl.querySelector<HTMLElement>(
        '.cm-scroller, .markdown-preview-view'
      );
      if (targetScrollerTop !== undefined && scrollerEl) {
        scrollerEl.scrollTop = targetScrollerTop;
      }
      if (
        targetSubViewScroll !== undefined &&
        typeof activeView.currentMode?.applyScroll === 'function'
      ) {
        activeView.currentMode.applyScroll(targetSubViewScroll);
      }
      if (targetEditorScroll && activeView.editor) {
        activeView.editor.scrollTo(targetEditorScroll.left, targetEditorScroll.top);
      }
    };

    if (section && activeView && activeView.editor) {
      const editor = activeView.editor;
      editor.replaceRange(
        newCodeBlock,
        { line: section.lineStart, ch: 0 },
        { line: section.lineEnd, ch: editor.getLine(section.lineEnd).length }
      );
      editor.setCursor({ line: section.lineStart, ch: 0 });

      // Apply across multiple frames to counter CodeMirror focus shifts or layout recalculations
      restoreScroll();
      window.requestAnimationFrame(restoreScroll);
      window.setTimeout(restoreScroll, 25);
      window.setTimeout(restoreScroll, 80);
      window.setTimeout(restoreScroll, 200);

      new Notice('Circuit updated in note');
      return;
    }

    // Fallback: Vault modification
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (file instanceof TFile) {
      void this.app.vault
        .process(file, (content) => {
          const rawOldBlock = `\`\`\`circuit\n${source.trim()}\n\`\`\``;
          if (content.includes(rawOldBlock)) {
            return content.replace(rawOldBlock, newCodeBlock);
          }
          if (content.includes(source)) {
            return content.replace(source, formattedJson);
          }
          return content;
        })
        .then(() => {
          restoreScroll();
          window.requestAnimationFrame(restoreScroll);
          window.setTimeout(restoreScroll, 40);
          window.setTimeout(restoreScroll, 120);
          window.setTimeout(restoreScroll, 250);
          new Notice('Circuit updated in note');
        });
    }
  }
}
