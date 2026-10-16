import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'preact/hooks';
import { api } from './api';
import type { Theme } from './palettes';
import { terminalTheme } from './themes';

/** One shell: an xterm.js view wired to a pty in the main process. Stays mounted while hidden. */
export function TerminalView({ id, theme, visible }: { id: string; theme: Theme; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);

  useEffect(() => {
    const t = new Terminal({
      fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
      fontSize: 13,
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
    const off = api.onEvent((e) => {
      if (e.type === 'ptyData' && e.id === id) t.write(e.data);
      if (e.type === 'ptyExit' && e.id === id) t.write(`\r\n\x1b[2m[process exited with code ${e.exitCode}]\x1b[0m\r\n`);
    });
    const resize = new ResizeObserver(() => {
      if (!host.current?.offsetParent) return; // hidden: keep the last size
      f.fit();
      void api.ptyResize(id, t.cols, t.rows);
    });
    resize.observe(host.current!);
    return () => {
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
