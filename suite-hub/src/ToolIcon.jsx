const icons = {
  cad: {
    tone: 'm5 9 9-5 9 5-9 5z',
    lines: 'm5 9 9-5 9 5v12l-9 5-9-5zM5 9l9 5 9-5M14 14v12M9 7l9 5M5 15l9 5m6 7 7-7 3 3-7 7-4 1zM25 22l3 3',
  },
  cad2d: {
    tone: 'M4 4h7v24H4z',
    lines: 'M11 4H4v24h24v-7M4 10h4M4 16h4M4 22h4M10 28v-4M16 28v-4M22 28v-4M16 18l-1 5 5-1L29 13l-4-4zM23 11l4 4',
  },
  bim: {
    tone: 'M5 27V8h13v19z',
    lines: 'M5 27V8h13v6M3 27h15M9 12h1m3 0h1M9 17h1m3 0h1M9 22h1M20 13l9 3v6c0 4-5 7-9 8-4-2-6-4-6-7v-7zM18 22l3 3 5-6',
  },
  pdf: {
    tone: 'M7 3h12l7 7v19H7z',
    lines: 'M7 3h12l7 7v19H7zM19 3v7h7M11 15h11M11 19h7M11 23h5M21 21v7l2-2 2 2v-7z',
  },
  ifc: {
    tone: 'm11 6 5-3 5 3-5 3zM3 21l5-3 5 3-5 3zM19 21l5-3 5 3-5 3z',
    lines: 'm11 6 5-3 5 3v6l-5 3-5-3zM11 6l5 3 5-3M16 9v6M3 21l5-3 5 3v6l-5 3-5-3zM3 21l5 3 5-3M8 24v6M19 21l5-3 5 3v6l-5 3-5-3zM19 21l5 3 5-3M24 24v6M16 15v3M8 18v-2h16v2',
  },
  calc: {
    tone: 'M4 5h23v7H4z',
    lines: 'M4 5h23v14M4 5v23h11M4 12h23M4 20h11M12 5v23M19 5v14M18 18h11v12H18zM21 21h5M21 25h1m4 0h1M21 28h1m4 0h1',
  },
  planner: {
    tone: 'M7 11h10v4H7zM12 18h11v4H12z',
    lines: 'M5 5v23h23M5 8h23M10 3v5M18 3v5M26 3v5M7 11h10v4H7zM12 18h11v4H12zM23 13h4v4M23 24l3 3 3-3-3-3z',
  },
  fem: {
    tone: 'M16 4 5 27h22z',
    lines: 'M16 4 5 27h22zM16 4v15M5 27l11-8 11 8M10 16h12M10 16l6 3 6-3M16 19v8',
    dots: [[16,4],[5,27],[27,27],[16,19],[10,16],[22,16]],
  },
  frame: {
    tone: 'M6 7h20v5H6z',
    lines: 'M6 7h20v5H6zM7 12v13h5V12M20 12v13h5V12M5 25h9M18 25h9M4 29l4-4m1 4 4-4m4 4 4-4m1 4 4-4M9 4h14M9 2v4M23 2v4',
  },
  calculation: {
    tone: 'M6 4h20v25H6z',
    lines: 'M6 4h20v25H6zM10 8h12M10 23h8M14 12h-4l3 4-3 4h4M23 12h-2l-2 8h-2M16 16h1M16 19h1',
  },
  geo: {
    tone: 'M4 20c4-3 7 3 12 0s8 3 12 0v8H4z',
    lines: 'M4 12h24M4 19c4-3 7 3 12 0s8 3 12 0M4 26c4-3 7 3 12 0s8 3 12 0M15 3h5v9M18 12v10M15 22l3 4 3-4M6 8l3-4 3 4',
  },
  speech: {
    tone: 'M12 4h8v16h-8z',
    lines: 'M12 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0zM8 15v1a8 8 0 0 0 16 0v-1M16 24v5M11 29h10M4 10v8M28 10v8M2 13v2M30 13v2',
  },
  stl: {
    tone: 'm4 16 12-6 12 6-12 6z',
    lines: 'm4 16 12-6 12 6-12 6zM4 21l12 6 12-6M4 26l12 6 12-6M11 7l5-3 5 3M11 7v6M21 7v6M11 7l5 3 5-3M16 10v6',
  },
  field: {
    tone: 'M6 7h20v23H6z',
    lines: 'M10 7H6v23h20V7h-4M12 3h8v7h-8zM10 17l2 2 3-4M18 17h4M10 25l2 2 3-4M18 25h4',
  },
  pointcloud: {
    tone: 'm8 16 8-9 10 8-8 10z',
    lines: 'M3 11V3h8M21 3h8v8M29 21v8h-8M11 29H3v-8',
    dots: [[9,10],[16,7],[22,10],[8,17],[15,14],[25,16],[11,24],[19,23],[20,17],[16,27]],
  },
  pile: {
    tone: 'M4 7h24v5H4zM7 12h3v15H7zM14 12h3v15h-3zM21 12h3v15h-3z',
    lines: 'M4 7h24v5H4zM7 12v15l1.5 3 1.5-3V12M14 12v15l1.5 3 1.5-3V12M21 12v15l1.5 3 1.5-3V12M2 18h3m22 0h3M2 24h3m22 0h3',
  },
};

export default function ToolIcon(props) {
  const icon = icons[props.id];
  return <svg class="tool-icon" width="32" height="32" viewBox="0 0 32 34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d={icon.tone} fill="currentColor" fill-opacity=".12" stroke="none"/>
    <path d={icon.lines}/>
    {icon.dots?.map(([x,y])=><circle cx={x} cy={y} r="1.5" fill="currentColor" stroke-width=".6"/>)}
  </svg>;
}
