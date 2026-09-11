/**
 * Neutral vector glyphs (24x24 viewBox, stroke = currentColor) used until real
 * brand icons land in v0.8. Each value is SVG inner markup.
 */
const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const GLYPHS: Record<string, string> = {
  box: `<rect x="4" y="5" width="16" height="14" rx="2.5" ${S}/>`,
  circle: `<circle cx="12" cy="12" r="8" ${S}/>`,
  database: `<ellipse cx="12" cy="6" rx="7" ry="2.8" ${S}/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" ${S}/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" ${S}/>`,
  table: `<rect x="4" y="5" width="16" height="14" rx="1.5" ${S}/><path d="M4 10h16M10 10v9" ${S}/>`,
  bucket: `<path d="M5 7l1.6 12a2 2 0 0 0 2 1.7h6.8a2 2 0 0 0 2-1.7L19 7" ${S}/><ellipse cx="12" cy="6.5" rx="7" ry="2.3" ${S}/>`,
  lambda: `<path d="M7 4.5h3l6.5 15h-3.2L9.6 10 7 19.5H4.2L8 8.2" ${S}/>`,
  server: `<rect x="4" y="4" width="16" height="7" rx="1.5" ${S}/><rect x="4" y="13" width="16" height="7" rx="1.5" ${S}/><path d="M7.5 7.5h.01M7.5 16.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  api: `<path d="M8.5 5.5c-2 0-2.5 1.5-2.5 3s-.5 3-3 3c2.5 0 3 1.5 3 3s.5 3 2.5 3M15.5 5.5c2 0 2.5 1.5 2.5 3s.5 3 3 3c-2.5 0-3 1.5-3 3s-.5 3-2.5 3" ${S}/>`,
  gateway: `<rect x="4" y="9" width="6" height="6" rx="1" ${S}/><rect x="14" y="4" width="6" height="6" rx="1" ${S}/><rect x="14" y="14" width="6" height="6" rx="1" ${S}/><path d="M10 12h2m0 0V7h2m-2 5v5h2" ${S}/>`,
  queue: `<rect x="3" y="9" width="4.5" height="6" rx="1" ${S}/><rect x="9.75" y="9" width="4.5" height="6" rx="1" ${S}/><rect x="16.5" y="9" width="4.5" height="6" rx="1" ${S}/>`,
  bolt: `<path d="M13 3 5.5 13.5h5L11 21l7.5-10.5h-5z" ${S}/>`,
  shield: `<path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V6z" ${S}/><path d="m9.2 11.8 2 2 3.6-3.8" ${S}/>`,
  globe: `<circle cx="12" cy="12" r="8" ${S}/><path d="M4 12h16M12 4c2.5 2.2 3.6 5 3.6 8S14.5 17.8 12 20c-2.5-2.2-3.6-5-3.6-8S9.5 6.2 12 4Z" ${S}/>`,
  doc: `<path d="M7 3.5h7L18 8v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" ${S}/><path d="M13.5 4v4.5H18" ${S}/>`,
  card: `<rect x="3.5" y="6" width="17" height="12" rx="2" ${S}/><path d="M3.5 10h17M7 14.5h4" ${S}/>`,
  triangle: `<path d="M12 5 20 18.5H4z" ${S}/>`,
  leaf: `<path d="M12 3.5c3.5 3.2 5.5 6.6 5.5 10a5.5 5.5 0 0 1-11 0c0-3.4 2-6.8 5.5-10Z" ${S}/><path d="M12 8v12.5" ${S}/>`,
  branch: `<circle cx="7" cy="6" r="2.2" ${S}/><circle cx="7" cy="18" r="2.2" ${S}/><circle cx="17" cy="9" r="2.2" ${S}/><path d="M7 8.2v7.6M17 11.2c0 3.3-4 3-7.2 3.6" ${S}/>`,
  cloud: `<path d="M7 17.5a4 4 0 0 1-.6-7.96 5.5 5.5 0 0 1 10.7 1.2A3.6 3.6 0 0 1 16.6 17.5z" ${S}/>`,
  spark: `<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" ${S}/>`,
  cube: `<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" ${S}/><path d="m4 7.5 8 4.5 8-4.5M12 12v9" ${S}/>`,
  user: `<circle cx="12" cy="8" r="3.5" ${S}/><path d="M5.5 20a6.5 6.5 0 0 1 13 0" ${S}/>`,
  phone: `<rect x="7" y="3" width="10" height="18" rx="2.5" ${S}/><path d="M11 17.5h2" ${S}/>`,
  clock: `<circle cx="12" cy="12" r="8" ${S}/><path d="M12 7.5V12l3 2" ${S}/>`,
  mail: `<rect x="3.5" y="5.5" width="17" height="13" rx="2" ${S}/><path d="m4.5 7.5 7.5 6 7.5-6" ${S}/>`,
  chat: `<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.6a.5.5 0 0 1-.8-.4z" ${S}/>`,
  chart: `<path d="M4 4v16h16" ${S}/><path d="M8 15v-4M12 15V7M16 15v-6" ${S}/>`,
  gear: `<circle cx="12" cy="12" r="3" ${S}/><path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" ${S}/>`,
  search: `<circle cx="10.5" cy="10.5" r="6" ${S}/><path d="m15.2 15.2 5 5" ${S}/>`,
  flame: `<path d="M12 3.5c1 3-4.5 5-4.5 10a4.5 4.5 0 0 0 9 0c0-2-1-3.5-2-4.5 0 1.2-.6 2-1.5 2.3.6-2.3-.2-5.8-1-7.8Z" ${S}/>`,
};
