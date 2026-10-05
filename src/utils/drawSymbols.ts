import { App, Component, finishRenderMath, MarkdownRenderer, renderMath } from 'obsidian';
import { CircuitComponent, CircuitLoop, ComponentType } from '../types';

export interface SymbolRenderOptions {
  app?: App;
  ownerComponent?: Component;
}

export function drawComponentSymbol(
  parent: SVGElement,
  comp: Pick<
    CircuitComponent,
    | 'type'
    | 'label'
    | 'value'
    | 'convention'
    | 'currentLabel'
    | 'voltageLabel'
    | 'controlFormula'
    | 'text'
    | 'fontSize'
  >,
  showLabel = true,
  opts?: SymbolRenderOptions
): void {
  const labelText = comp.label
    ? `${comp.label}${comp.value ? ` (${comp.value})` : ''}`
    : comp.value || '';

  switch (comp.type) {
    case 'resistor':
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-15', y2: '0' } });
      parent.createSvg('path', {
        attr: { d: 'M -15 0 L -11 -9 L -6 9 L -1 -9 L 4 9 L 9 -9 L 14 9 L 16 0' },
      });
      parent.createSvg('line', { attr: { x1: '16', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'capacitor':
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-6', y2: '0' } });
      parent.createSvg('line', { attr: { x1: '-6', y1: '-14', x2: '-6', y2: '14' } });
      parent.createSvg('line', { attr: { x1: '6', y1: '-14', x2: '6', y2: '14' } });
      parent.createSvg('line', { attr: { x1: '6', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'inductor':
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-18', y2: '0' } });
      parent.createSvg('path', {
        attr: { d: 'M -18,0 A 6,6 0 0,1 -6,0 A 6,6 0 0,1 6,0 A 6,6 0 0,1 18,0' },
      });
      parent.createSvg('line', { attr: { x1: '18', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'dc_source':
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-4', y2: '0' } });
      parent.createSvg('line', { attr: { x1: '-4', y1: '-16', x2: '-4', y2: '16' } });
      parent.createSvg('line', { attr: { x1: '4', y1: '-9', x2: '4', y2: '9' } });
      parent.createSvg('line', { attr: { x1: '4', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'ac_source':
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-15', y2: '0' } });
      parent.createSvg('circle', { attr: { cx: '0', cy: '0', r: '15' } });
      parent.createSvg('path', { attr: { d: 'M -8,0 Q -4,-8 0,0 T 8,0' } });
      parent.createSvg('line', { attr: { x1: '15', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'current_source':
      // Independent Current Source: circle with internal arrow pointing from p1 to p2
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-15', y2: '0' } });
      parent.createSvg('circle', { attr: { cx: '0', cy: '0', r: '15' } });
      parent.createSvg('line', { attr: { x1: '-8', y1: '0', x2: '8', y2: '0' } });
      parent.createSvg('polygon', {
        attr: { points: '3,-4 9,0 3,4', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '15', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'vcvs':
    case 'ccvs':
      // Dependent Voltage Sources: Diamond with +/- inside
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-16', y2: '0' } });
      parent.createSvg('polygon', {
        attr: { points: '-16,0 0,-16 16,0 0,16', fill: 'none' },
      });
      // Plus sign on left/p1 side
      parent.createSvg('text', {
        attr: {
          x: '-6',
          y: '4',
          fill: 'var(--text-normal)',
          'font-size': '11',
          'font-weight': 'bold',
          'text-anchor': 'middle',
          stroke: 'none',
        },
      }).textContent = '+';
      // Minus sign on right/p2 side
      parent.createSvg('text', {
        attr: {
          x: '6',
          y: '4',
          fill: 'var(--text-normal)',
          'font-size': '13',
          'font-weight': 'bold',
          'text-anchor': 'middle',
          stroke: 'none',
        },
      }).textContent = '−';
      parent.createSvg('line', { attr: { x1: '16', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'vccs':
    case 'cccs':
      // Dependent Current Sources: Diamond with arrow inside
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-16', y2: '0' } });
      parent.createSvg('polygon', {
        attr: { points: '-16,0 0,-16 16,0 0,16', fill: 'none' },
      });
      parent.createSvg('line', { attr: { x1: '-8', y1: '0', x2: '8', y2: '0' } });
      parent.createSvg('polygon', {
        attr: { points: '3,-4 9,0 3,4', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '16', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'switch_open':
      // Open switch with blade at angle and closing arc (Image 3)
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-14', y2: '0' } });
      parent.createSvg('circle', {
        attr: { cx: '-14', cy: '0', r: '2.5', fill: 'var(--text-normal)' },
      });
      // Angled open blade
      parent.createSvg('line', {
        attr: { x1: '-14', y1: '0', x2: '10', y2: '-12', 'stroke-width': '2.2' },
      });
      // Terminal dot
      parent.createSvg('circle', {
        attr: { cx: '14', cy: '0', r: '2.5', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '14', y1: '0', x2: '30', y2: '0' } });
      // Closing action arc
      parent.createSvg('path', {
        attr: {
          d: 'M 4,-14 A 12,12 0 0,1 8,-3',
          'stroke-dasharray': '2 2',
          'stroke-width': '1.2',
        },
      });
      parent.createSvg('polygon', {
        attr: { points: '5,-3 8,-1 10,-5', fill: 'var(--text-normal)' },
      });
      break;

    case 'switch_closed':
      // Closed switch with blade in contact and opening arc (Image 3)
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-14', y2: '0' } });
      parent.createSvg('circle', {
        attr: { cx: '-14', cy: '0', r: '2.5', fill: 'var(--text-normal)' },
      });
      // Blade resting on contact
      parent.createSvg('line', {
        attr: { x1: '-14', y1: '0', x2: '14', y2: '-2', 'stroke-width': '2.2' },
      });
      parent.createSvg('circle', {
        attr: { cx: '14', cy: '0', r: '2.5', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '14', y1: '0', x2: '30', y2: '0' } });
      // Opening action arc
      parent.createSvg('path', {
        attr: {
          d: 'M 8,-3 A 12,12 0 0,0 4,-14',
          'stroke-dasharray': '2 2',
          'stroke-width': '1.2',
        },
      });
      parent.createSvg('polygon', {
        attr: { points: '6,-12 3,-15 2,-11', fill: 'var(--text-normal)' },
      });
      break;

    case 'switch_spdt':
      // SPDT switch (deviatore a due vie) (Image 3)
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-14', y2: '0' } });
      parent.createSvg('circle', {
        attr: { cx: '-14', cy: '0', r: '2.5', fill: 'var(--text-normal)' },
      });
      // Blade connected towards out1
      parent.createSvg('line', {
        attr: { x1: '-14', y1: '0', x2: '14', y2: '-10', 'stroke-width': '2.2' },
      });
      // Contact 1 (upper)
      parent.createSvg('circle', {
        attr: { cx: '14', cy: '-12', r: '2.5', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '14', y1: '-12', x2: '30', y2: '-12' } });
      // Contact 2 (lower)
      parent.createSvg('circle', {
        attr: { cx: '14', cy: '12', r: '2.5', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '14', y1: '12', x2: '30', y2: '12' } });
      // Switching arrow arc
      parent.createSvg('path', {
        attr: {
          d: 'M 6,-6 A 14,14 0 0,1 6,8',
          'stroke-dasharray': '2 2',
          'stroke-width': '1.2',
        },
      });
      parent.createSvg('polygon', {
        attr: { points: '3,5 6,9 8,5', fill: 'var(--text-normal)' },
      });
      break;

    case 'junction':
      // Node junction point: clean terminal dot
      parent.createSvg('circle', {
        attr: {
          cx: '0',
          cy: '0',
          r: '5',
          fill: 'var(--text-accent)',
          stroke: 'none',
        },
      });
      break;

    case 'ground':
      parent.createSvg('line', { attr: { x1: '0', y1: '-20', x2: '0', y2: '0' } });
      parent.createSvg('line', { attr: { x1: '-14', y1: '0', x2: '14', y2: '0' } });
      parent.createSvg('line', { attr: { x1: '-8', y1: '5', x2: '8', y2: '5' } });
      parent.createSvg('line', { attr: { x1: '-3', y1: '10', x2: '3', y2: '10' } });
      break;

    case 'diode':
      parent.createSvg('line', { attr: { x1: '-30', y1: '0', x2: '-10', y2: '0' } });
      parent.createSvg('polygon', {
        attr: { points: '-10,-10 -10,10 10,0', fill: 'var(--text-normal)' },
      });
      parent.createSvg('line', { attr: { x1: '10', y1: '-10', x2: '10', y2: '10' } });
      parent.createSvg('line', { attr: { x1: '10', y1: '0', x2: '30', y2: '0' } });
      break;

    case 'text': {
      const rawText = comp.text || comp.label || comp.value || 'Text / LaTeX';
      const fontSize = comp.fontSize || 13;
      const lines = rawText.split('\n');
      const lineCount = Math.max(1, lines.length);
      const maxLineLen = Math.max(8, ...lines.map((l) => l.length));
      const estHeight = Math.max(40, lineCount * 24 + 12);
      const estWidth = Math.max(140, Math.min(420, maxLineLen * 9 + 30));
      const foX = -Math.round(estWidth / 2);
      const foY = -Math.round(estHeight / 2);

      const fo = parent.createSvg('foreignObject', {
        attr: {
          x: String(foX),
          y: String(foY),
          width: String(estWidth),
          height: String(estHeight),
          style: 'overflow: visible; pointer-events: none;',
        },
      });

      const div = createDiv({ cls: 'circuit-markdown-text' });
      div.setCssProps({ '--circuit-font-size': `${fontSize}px` });

      if (opts?.app) {
        const ownerComp = opts.ownerComponent ?? new Component();
        void MarkdownRenderer.render(opts.app, rawText, div, '', ownerComp);
      } else {
        renderMathFallback(div, rawText);
      }

      fo.appendChild(div);
      break;
    }
  }

  // Dependent source control formula label below component
  const defaultFormula =
    comp.type === 'vcvs'
      ? 'v = α·vp'
      : comp.type === 'ccvs'
      ? 'v = rm·ip'
      : comp.type === 'vccs'
      ? 'i = gm·vp'
      : comp.type === 'cccs'
      ? 'i = β·ip'
      : undefined;

  const formulaToDisplay = comp.controlFormula || defaultFormula;
  if (formulaToDisplay) {
    const cfText = parent.createSvg('text', {
      attr: {
        x: '0',
        y: '28',
        fill: 'var(--text-muted)',
        'font-size': '10',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-style': 'italic',
        'font-weight': '600',
      },
    });
    cfText.textContent = formulaToDisplay;
  }

  // Switch timing annotation
  if (comp.type === 'switch_open' || comp.type === 'switch_closed' || comp.type === 'switch_spdt') {
    const timeText = parent.createSvg('text', {
      attr: {
        x: '-2',
        y: '-17',
        fill: 'var(--text-normal)',
        'font-size': '10',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-style': 'italic',
        'font-weight': '600',
      },
    });
    timeText.textContent = 't = 0';
  }

  // Sign conventions (Convenzione dell'Utilizzatore / Generatore - Image 2)
  if (comp.convention && comp.convention !== 'none') {
    drawSignConvention(parent, comp.convention, comp.currentLabel, comp.voltageLabel);
  }

  // Main Component Label & Value (omit default auto-label for junctions and text)
  const isDefaultJunction = comp.type === 'junction' && (!comp.label || /^J\d+$/.test(comp.label));
  if (showLabel && labelText && !isDefaultJunction && comp.type !== 'text') {
    const hasConvention = comp.convention && comp.convention !== 'none';
    const hasFormula = Boolean(formulaToDisplay);
    const labelY = comp.type === 'ground' ? '22' : hasConvention || hasFormula ? '38' : '-18';

    const textEl = parent.createSvg('text', {
      attr: {
        x: '0',
        y: String(labelY),
        fill: 'var(--text-normal)',
        'font-size': '11',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-weight': '500',
      },
    });
    textEl.textContent = labelText;
  }
}

/**
 * Draws terminal polarities (+ and -) and current arrow with labels according to
 * Passive (Utilizzatore) or Active (Generatore) sign conventions.
 */
function drawSignConvention(
  parent: SVGElement,
  convention: 'passive' | 'active',
  currentLabel?: string,
  voltageLabel?: string
): void {
  const g = parent.createSvg('g', {
    attr: {
      class: `circuit-convention circuit-convention-${convention}`,
      stroke: 'var(--text-accent)',
      fill: 'none',
    },
  });

  // Plus sign (+) near p1 terminal
  g.createSvg('text', {
    attr: {
      x: '-22',
      y: '-8',
      fill: 'var(--text-accent)',
      'font-size': '12',
      'font-weight': 'bold',
      'text-anchor': 'middle',
      stroke: 'none',
    },
  }).textContent = '+';

  // Minus sign (-) near p2 terminal
  g.createSvg('text', {
    attr: {
      x: '22',
      y: '-8',
      fill: 'var(--text-accent)',
      'font-size': '14',
      'font-weight': 'bold',
      'text-anchor': 'middle',
      stroke: 'none',
    },
  }).textContent = '−';

  // Current arrow
  if (convention === 'passive') {
    // Passive (Utilizzatore): Current enters positive terminal (points right towards p1/center)
    g.createSvg('line', {
      attr: {
        x1: '-36',
        y1: '-18',
        x2: '-18',
        y2: '-18',
        'stroke-width': '1.8',
      },
    });
    g.createSvg('polygon', {
      attr: {
        points: '-21,-21 -15,-18 -21,-15',
        fill: 'var(--text-accent)',
        stroke: 'none',
      },
    });
    // Current label
    const iText = g.createSvg('text', {
      attr: {
        x: '-27',
        y: '-24',
        fill: 'var(--text-accent)',
        'font-size': '10',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-style': 'italic',
        'font-weight': '600',
      },
    });
    iText.textContent = currentLabel || 'i(t)';
  } else {
    // Active (Generatore): Current leaves positive terminal (points left away from p1)
    g.createSvg('line', {
      attr: {
        x1: '-18',
        y1: '-18',
        x2: '-36',
        y2: '-18',
        'stroke-width': '1.8',
      },
    });
    g.createSvg('polygon', {
      attr: {
        points: '-33,-21 -39,-18 -33,-15',
        fill: 'var(--text-accent)',
        stroke: 'none',
      },
    });
    // Current label
    const iText = g.createSvg('text', {
      attr: {
        x: '-27',
        y: '-24',
        fill: 'var(--text-accent)',
        'font-size': '10',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-style': 'italic',
        'font-weight': '600',
      },
    });
    iText.textContent = currentLabel || 'i(t)';
  }

  // Voltage label: placed clearly BELOW the component lead so it never overlaps the symbol
  const vText = g.createSvg('text', {
    attr: {
      x: '0',
      y: '22',
      fill: 'var(--text-accent)',
      'font-size': '10',
      'text-anchor': 'middle',
      stroke: 'none',
      'font-style': 'italic',
      'font-weight': '600',
    },
  });
  vText.textContent = voltageLabel || 'v(t)';
}

/**
 * Draws a circuit mesh loop indicator (curved circular arc with arrowhead and label).
 */
export function drawLoopSymbol(parent: SVGElement, loop: CircuitLoop, isSelected = false): void {
  const r = loop.radius || 24;
  const isCW = loop.direction !== 'ccw';
  const strokeColor = isSelected ? 'var(--interactive-accent)' : 'var(--text-accent)';

  const loopG = parent.createSvg('g', {
    attr: {
      class: `circuit-loop-symbol ${isSelected ? 'is-selected' : ''}`,
      transform: `translate(${loop.x}, ${loop.y})`,
      stroke: strokeColor,
      fill: 'none',
      style: 'cursor: pointer; pointer-events: all;',
      'data-loop-id': loop.id,
    },
  });

  // Transparent full hit-circle for effortless clicking and dragging!
  loopG.createSvg('circle', {
    attr: {
      cx: '0',
      cy: '0',
      r: String(r + 10),
      fill: isSelected ? 'var(--background-modifier-hover)' : 'transparent',
      'fill-opacity': isSelected ? '0.2' : '0',
      'pointer-events': 'all',
      style: 'cursor: pointer;',
    },
  });

  // Circular arc with gap for arrowhead
  const startAngle = isCW ? -140 : 40;
  const endAngle = isCW ? 100 : -140;
  const radStart = (startAngle * Math.PI) / 180;
  const radEnd = (endAngle * Math.PI) / 180;

  const sx = Math.round(r * Math.cos(radStart));
  const sy = Math.round(r * Math.sin(radStart));
  const ex = Math.round(r * Math.cos(radEnd));
  const ey = Math.round(r * Math.sin(radEnd));

  const sweep = isCW ? 1 : 0;
  const d = `M ${sx} ${sy} A ${r} ${r} 0 1 ${sweep} ${ex} ${ey}`;

  loopG.createSvg('path', {
    attr: {
      d,
      'stroke-width': isSelected ? '2.5' : '1.8',
      'stroke-dasharray': '4 2',
      fill: 'none',
      style: 'pointer-events: none;',
    },
  });

  // Arrowhead
  const arrowAngle = isCW ? radEnd + Math.PI / 2 : radEnd - Math.PI / 2;
  const ax1 = Math.round(ex - 6 * Math.cos(arrowAngle - 0.5));
  const ay1 = Math.round(ey - 6 * Math.sin(arrowAngle - 0.5));
  const ax2 = Math.round(ex - 6 * Math.cos(arrowAngle + 0.5));
  const ay2 = Math.round(ey - 6 * Math.sin(arrowAngle + 0.5));

  loopG.createSvg('polygon', {
    attr: {
      points: `${ex},${ey} ${ax1},${ay1} ${ax2},${ay2}`,
      fill: strokeColor,
      stroke: strokeColor,
      style: 'pointer-events: none;',
    },
  });

  // Center label (e.g. M1)
  const textEl = loopG.createSvg('text', {
    attr: {
      x: '0',
      y: '4',
      fill: strokeColor,
      'font-size': '11',
      'font-weight': 'bold',
      'text-anchor': 'middle',
      stroke: 'none',
      style: 'pointer-events: none;',
    },
  });
  textEl.textContent = loop.label;

  // Value / equation below loop
  if (loop.value) {
    const valEl = loopG.createSvg('text', {
      attr: {
        x: '0',
        y: String(r + 15),
        fill: 'var(--text-muted)',
        'font-size': '10',
        'text-anchor': 'middle',
        stroke: 'none',
        'font-style': 'italic',
        style: 'pointer-events: none;',
      },
    });
    valEl.textContent = loop.value;
  }
}

function renderMathFallback(container: HTMLElement, text: string): void {
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$]+?\$)/g;
  const parts = text.split(mathRegex);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('$$') && part.endsWith('$$')) {
      const mathSrc = part.slice(2, -2).trim();
      try {
        const mathEl = renderMath(mathSrc, true);
        container.appendChild(mathEl);
        void finishRenderMath();
      } catch {
        container.createSpan({ text: part });
      }
    } else if (part.startsWith('$') && part.endsWith('$')) {
      const mathSrc = part.slice(1, -1).trim();
      try {
        const mathEl = renderMath(mathSrc, false);
        container.appendChild(mathEl);
        void finishRenderMath();
      } catch {
        container.createSpan({ text: part });
      }
    } else {
      container.createSpan({ text: part });
    }
  }
}

/**
 * Draws a clean, minimalist SVG schematic icon for a component in a toolbar button.
 */
export function drawComponentMiniatureSVG(
  container: HTMLElement,
  type: ComponentType | 'loop'
): SVGSVGElement {
  const svg = container.createSvg('svg', {
    cls: 'circuit-toolbar-symbol',
    attr: {
      width: '24',
      height: '16',
      viewBox: '-20 -10 40 20',
      stroke: 'currentColor',
      fill: 'none',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  });

  switch (type) {
    case 'resistor':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-11', y2: '0' } });
      svg.createSvg('path', {
        attr: { d: 'M -11 0 L -8 -6 L -4 6 L 0 -6 L 4 6 L 8 -6 L 11 0' },
      });
      svg.createSvg('line', { attr: { x1: '11', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'capacitor':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-4', y2: '0' } });
      svg.createSvg('line', { attr: { x1: '-4', y1: '-8', x2: '-4', y2: '8' } });
      svg.createSvg('line', { attr: { x1: '4', y1: '-8', x2: '4', y2: '8' } });
      svg.createSvg('line', { attr: { x1: '4', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'inductor':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-12', y2: '0' } });
      svg.createSvg('path', {
        attr: { d: 'M -12,0 A 4,4 0 0,1 -4,0 A 4,4 0 0,1 4,0 A 4,4 0 0,1 12,0' },
      });
      svg.createSvg('line', { attr: { x1: '12', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'diode':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-7', y2: '0' } });
      svg.createSvg('polygon', {
        attr: { points: '-7,-7 -7,7 6,0', fill: 'currentColor' },
      });
      svg.createSvg('line', { attr: { x1: '6', y1: '-7', x2: '6', y2: '7' } });
      svg.createSvg('line', { attr: { x1: '6', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'dc_source':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-3', y2: '0' } });
      svg.createSvg('line', { attr: { x1: '-3', y1: '-8', x2: '-3', y2: '8' } });
      svg.createSvg('line', { attr: { x1: '3', y1: '-5', x2: '3', y2: '5' } });
      svg.createSvg('line', { attr: { x1: '3', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'ac_source':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-9', y2: '0' } });
      svg.createSvg('circle', { attr: { cx: '0', cy: '0', r: '9' } });
      svg.createSvg('path', { attr: { d: 'M -5,0 Q -2.5,-4 0,0 T 5,0' } });
      svg.createSvg('line', { attr: { x1: '9', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'current_source':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-9', y2: '0' } });
      svg.createSvg('circle', { attr: { cx: '0', cy: '0', r: '9' } });
      svg.createSvg('line', { attr: { x1: '-5', y1: '0', x2: '5', y2: '0' } });
      svg.createSvg('polygon', {
        attr: { points: '2,-3 6,0 2,3', fill: 'currentColor', stroke: 'none' },
      });
      svg.createSvg('line', { attr: { x1: '9', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'vcvs':
    case 'ccvs':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-10', y2: '0' } });
      svg.createSvg('polygon', { attr: { points: '-10,0 0,-9 10,0 0,9' } });
      svg.createSvg('text', {
        attr: {
          x: '-4',
          y: '3',
          'font-size': '7',
          'font-weight': 'bold',
          fill: 'currentColor',
          stroke: 'none',
          'text-anchor': 'middle',
        },
      }).textContent = '+';
      svg.createSvg('text', {
        attr: {
          x: '4',
          y: '3',
          'font-size': '9',
          'font-weight': 'bold',
          fill: 'currentColor',
          stroke: 'none',
          'text-anchor': 'middle',
        },
      }).textContent = '−';
      svg.createSvg('line', { attr: { x1: '10', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'vccs':
    case 'cccs':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-10', y2: '0' } });
      svg.createSvg('polygon', { attr: { points: '-10,0 0,-9 10,0 0,9' } });
      svg.createSvg('line', { attr: { x1: '-5', y1: '0', x2: '5', y2: '0' } });
      svg.createSvg('polygon', {
        attr: { points: '2,-3 6,0 2,3', fill: 'currentColor', stroke: 'none' },
      });
      svg.createSvg('line', { attr: { x1: '10', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'switch_open':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-9', y2: '0' } });
      svg.createSvg('circle', { attr: { cx: '-9', cy: '0', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '-9', y1: '0', x2: '7', y2: '-7' } });
      svg.createSvg('circle', { attr: { cx: '9', cy: '0', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '9', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'switch_closed':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-9', y2: '0' } });
      svg.createSvg('circle', { attr: { cx: '-9', cy: '0', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '-9', y1: '0', x2: '9', y2: '-1.5' } });
      svg.createSvg('circle', { attr: { cx: '9', cy: '0', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '9', y1: '0', x2: '19', y2: '0' } });
      break;

    case 'switch_spdt':
      svg.createSvg('line', { attr: { x1: '-19', y1: '0', x2: '-9', y2: '0' } });
      svg.createSvg('circle', { attr: { cx: '-9', cy: '0', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '-9', y1: '0', x2: '7', y2: '-6' } });
      svg.createSvg('circle', { attr: { cx: '9', cy: '-6', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '9', y1: '-6', x2: '19', y2: '-6' } });
      svg.createSvg('circle', { attr: { cx: '9', cy: '6', r: '1.8', fill: 'currentColor' } });
      svg.createSvg('line', { attr: { x1: '9', y1: '6', x2: '19', y2: '6' } });
      break;

    case 'ground':
      svg.createSvg('line', { attr: { x1: '0', y1: '-9', x2: '0', y2: '0' } });
      svg.createSvg('line', { attr: { x1: '-9', y1: '0', x2: '9', y2: '0' } });
      svg.createSvg('line', { attr: { x1: '-5', y1: '4', x2: '5', y2: '4' } });
      svg.createSvg('line', { attr: { x1: '-2', y1: '8', x2: '2', y2: '8' } });
      break;

    case 'junction':
      svg.createSvg('line', { attr: { x1: '-16', y1: '0', x2: '16', y2: '0' } });
      svg.createSvg('line', { attr: { x1: '0', y1: '-7', x2: '0', y2: '7' } });
      svg.createSvg('circle', {
        attr: { cx: '0', cy: '0', r: '4', fill: 'currentColor', stroke: 'none' },
      });
      break;

    case 'loop':
      svg.createSvg('path', {
        attr: { d: 'M -7 -5 A 8 8 0 1 1 7 0', 'stroke-dasharray': '2.5 1.5' },
      });
      svg.createSvg('polygon', {
        attr: { points: '4,-3 7,0 5,3', fill: 'currentColor', stroke: 'none' },
      });
      svg.createSvg('text', {
        attr: {
          x: '-0.5',
          y: '3',
          'font-size': '8',
          'font-weight': 'bold',
          fill: 'currentColor',
          stroke: 'none',
          'text-anchor': 'middle',
        },
      }).textContent = 'M';
      break;

    case 'text':
      svg.createSvg('text', {
        attr: {
          x: '-5',
          y: '4',
          'font-size': '12',
          'font-weight': 'bold',
          fill: 'currentColor',
          stroke: 'none',
          'font-style': 'italic',
        },
      }).textContent = 'T';
      svg.createSvg('text', {
        attr: {
          x: '4',
          y: '4',
          'font-size': '10',
          'font-weight': 'bold',
          fill: 'currentColor',
          stroke: 'none',
          'font-style': 'italic',
        },
      }).textContent = 'x';
      break;
  }

  return svg;
}
