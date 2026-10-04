import { CircuitComponent } from '../types';

export function drawComponentSymbol(
  parent: SVGElement,
  comp: Pick<CircuitComponent, 'type' | 'label' | 'value'>,
  showLabel = true
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
  }

  if (showLabel && labelText) {
    const textEl = parent.createSvg('text', {
      attr: {
        x: '0',
        y: '-18',
        fill: 'var(--text-normal)',
        'font-size': '11',
        'text-anchor': 'middle',
        stroke: 'none',
      },
    });
    textEl.textContent = labelText;
  }
}
