import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'preact/hooks';
import { api } from './api';
import { CODE_FONTS, appearance, onAppearance } from './appearance';
import type { Theme } from './palettes';
import { terminalTheme } from './themes';

/** One shell: an xterm.js view wired to a pty in the main process. Stays mounted while hidden. */
export function TerminalView({ id, theme, visible }: { id: string; theme: Theme; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);

  useEffect(() => {
    const a = appearance();
    const t = new Terminal({
      fontFamily: CODE_FONTS[a.codeFont].stack,
      fontSize: a.codeSize,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme(theme),
      allowProposedApi: false,
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current!);
    term.current = t;
    fit.current = f;
    const input = t.onData((data) => void api.ptyWrite(id, data));
    // Listen first, then replay what was printed before this view existed;
    // chunks the replay already covers (by sequence number) are skipped.
    let replayedUpTo: number | null = null;
    const early: { data: string; seq: number }[] = [];
    const off = api.onEvent((e) => {
      if (e.type === 'ptyData' && e.id === id) {
        if (replayedUpTo === null) early.push(e);
        else if (e.seq > replayedUpTo) t.write(e.data);
      }
      if (e.type === 'ptyExit' && e.id === id) t.write(`\r\n\x1b[2m[process exited with code ${e.exitCode}]\x1b[0m\r\n`);
    });
    void api.ptyBuffer(id).then(({ data, seq }) => {
      t.write(data);
      replayedUpTo = seq;
      for (const e of early) if (e.seq > seq) t.write(e.data);
    });
    const resize = new ResizeObserver(() => {
      if (!host.current?.offsetParent) return; // hidden: keep the last size
      f.fit();
      void api.ptyResize(id, t.cols, t.rows);
    });
    resize.observe(host.current!);
    const offFonts = onAppearance((next) => {
      t.options.fontFamily = CODE_FONTS[next.codeFont].stack;
      t.options.fontSize = next.codeSize;
      f.fit();
    });
    return () => {
      offFonts();
      resize.disconnect();
      input.dispose();
      off();
      t.dispose();
    };
  }, [id]);

  useEffect(() => {
    if (term.current) term.current.options.theme = terminalTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (visible && term.current) {
      fit.current?.fit();
      term.current.focus();
    }
  }, [visible]);

  return <div class="terminal-host" ref={host} hidden={!visible} />;
}
