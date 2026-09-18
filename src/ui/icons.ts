const paths = {
  pointer: 'M5 3l14 9-7 1-3 7-4-17Z',
  book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4V4Zm9 3a3 3 0 0 1 3-3h5v14h-5a3 3 0 0 0-3 3',
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  down: 'M12 4v16m-6-6 6 6 6-6',
  up: 'M12 20V4m-6 6 6-6 6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  copy: 'M9 9h11v12H9V9ZM5 16H3V3h12v2',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  image: 'M3 3h18v18H3V3Zm0 13 5-5 4 4 3-3 6 6M8 7h.01',
  crop: 'M6 3v15h15M3 6h15v15',
  highlight: 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M7 7h10v10H7V7Z',
  redact: 'M3 7h18v10H3V7ZM7 10v4M11 10v4M15 10v4M19 10v4',
  undo: 'M8 4 3 9l5 5M3 9h12a6 6 0 0 1 0 12h-3',
  save: 'M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7',
  play: 'M7 4l14 8-14 8V4Z',
  pause: 'M7 4v16M17 4v16',
  stop: 'M5 5h14v14H5V5Z',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3V7Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  print: 'M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7V14Z',
  clock: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
} as const;
export type IconName = keyof typeof paths;
export function icon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
