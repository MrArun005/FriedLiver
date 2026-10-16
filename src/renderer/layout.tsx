import { useEffect, useState } from 'preact/hooks';

/** Where the agents panel sits: beside the editor, or in the middle with the editor beside it. */
export type AgentPlacement = 'side' | 'center';

export interface Layout {
  agents: AgentPlacement;
  /** Width of the right-hand column, remembered separately for each placement. */
  sideWidth: Record<AgentPlacement, number>;
}

const STORAGE_KEY = 'friedliver.layout';
const DEFAULT_LAYOUT: Layout = { agents: 'side', sideWidth: { side: 400, center: 560 } };
const TREE_WIDTH = 220;
const MIN_SIDE = 300;
const MIN_CENTER = 360;

function load(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Layout> | null;
    return {
      agents: saved?.agents === 'center' ? 'center' : 'side',
      sideWidth: { ...DEFAULT_LAYOUT.sideWidth, ...saved?.sideWidth },
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function useLayout(): [Layout, (change: Partial<Layout>) => void] {
  const [layout, setLayout] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Storage unavailable: the layout still applies for this session.
    }
  }, [layout]);
  return [layout, (change) => setLayout((l) => ({ ...l, ...change }))];
}

export function clampSideWidth(width: number): number {
  return Math.round(Math.min(Math.max(width, MIN_SIDE), window.innerWidth - TREE_WIDTH - MIN_CENTER));
}

/** The draggable divider between the middle column and the right-hand one. */
export function Splitter({ onResize }: { onResize(width: number): void }) {
  const start = (down: PointerEvent) => {
    const bar = down.currentTarget as HTMLElement;
    bar.setPointerCapture(down.pointerId);
    document.body.classList.add('resizing');
    const move = (e: PointerEvent) => onResize(clampSideWidth(window.innerWidth - e.clientX));
    const up = () => {
      bar.removeEventListener('pointermove', move);
      document.body.classList.remove('resizing');
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up, { once: true });
  };
  return <div class="splitter" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={start} />;
}
