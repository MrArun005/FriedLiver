import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';
import { editorFontOptions } from './appearance';
import { FileIcon, Icon } from './icons';
import { LiverLogo } from './logo';
import { monaco } from './monaco';
import { Keys, basename, isMac, modKey } from './ui';

export interface WriteReview {
  reviewId: string;
  chatId?: string;
  path: string;
  before: string | null;
  after: string;
}

export interface DiffView {
  title: string;
  path: string;
  original: string;
  modified: string;
}

// No `theme` or fonts here: themes.ts sets one global Monaco theme, and
// appearance.ts owns the fonts (and updates open editors when they change).
const BASE_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  bracketPairColorization: { enabled: true },
  smoothScrolling: true,
};
const options = () => ({ ...BASE_OPTIONS, ...editorFontOptions() });

interface EditorPaneProps {
  tabs: string[];
  active: string | null;
  dirty: Set<string>;
  review: WriteReview | null;
  pendingReviews: number;
  diffView: DiffView | null;
  reveal: { path: string; line: number; n: number } | null;
  changedFile: { path: string; n: number } | null;
  onActivate(path: string): void;
  onClose(path: string): void;
  onCloseDiff(): void;
  onDirtyChange(path: string, dirty: boolean): void;
  onSaved(path: string): void;
}

/** Tabs and the Monaco editor, with the agent-edit review or a git diff shown on top when present. */
export function EditorPane(props: EditorPaneProps) {
  const { tabs, active, review, diffView } = props;
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  const saved = useRef(new Map<string, number>());
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const current = useRef<string | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, { ...options(), model: null });
    editor.current = ed;
    const sub = ed.onDidChangeModelContent(() => {
      const path = current.current;
      const model = ed.getModel();
      if (path && model) propsRef.current.onDirtyChange(path, model.getAlternativeVersionId() !== saved.current.get(path));
    });
    const save = ed.addAction({
      id: 'friedliver.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: async () => {
        const path = current.current;
        const model = ed.getModel();
        if (!path || !model) return;
        await api.writeFile(path, model.getValue());
        saved.current.set(path, model.getAlternativeVersionId());
        propsRef.current.onDirtyChange(path, false);
        propsRef.current.onSaved(path);
      },
    });
    return () => {
      sub.dispose();
      save.dispose();
      ed.dispose();
    };
  }, []);

  // Opening a file from search fires two loads at once (activate + reveal); share one.
  const loading = useRef(new Map<string, Promise<monaco.editor.ITextModel>>());

  function modelFor(path: string, reload = false): Promise<monaco.editor.ITextModel> {
    const existing = monaco.editor.getModel(monaco.Uri.file(path));
    if (existing && !reload) return Promise.resolve(existing);
    const inFlight = loading.current.get(path);
    if (inFlight) return inFlight;
    const load = (async () => {
      const text = await api.readFile(path);
      const model = monaco.editor.getModel(monaco.Uri.file(path)) ?? monaco.editor.createModel(text, undefined, monaco.Uri.file(path));
      if (model.getValue() !== text) model.setValue(text);
      saved.current.set(path, model.getAlternativeVersionId());
      return model;
    })().finally(() => loading.current.delete(path));
    loading.current.set(path, load);
    return load;
  }

  async function show(path: string | null): Promise<void> {
    const ed = editor.current!;
    if (current.current) viewStates.current.set(current.current, ed.saveViewState());
    current.current = path;
    if (!path) {
      ed.setModel(null);
      return;
    }
    try {
      ed.setModel(await modelFor(path));
      const state = viewStates.current.get(path);
      if (state) ed.restoreViewState(state);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void show(active);
  }, [active]);

  // Closed tabs release their models, so memory doesn't grow with every file ever opened.
  useEffect(() => {
    const open = new Set(tabs.map((p) => monaco.Uri.file(p).toString()));
    for (const model of monaco.editor.getModels()) {
      if (model.uri.scheme === 'file' && !open.has(model.uri.toString())) {
        saved.current.delete(model.uri.fsPath);
        viewStates.current.delete(model.uri.fsPath);
        model.dispose();
      }
    }
  }, [tabs]);

  // An accepted agent edit or an undone turn reloads the file, unless it has unsaved changes.
  useEffect(() => {
    const changed = props.changedFile;
    if (!changed || props.dirty.has(changed.path)) return;
    if (monaco.editor.getModel(monaco.Uri.file(changed.path))) void modelFor(changed.path, true);
  }, [props.changedFile]);

  useEffect(() => {
    const target = props.reveal;
    if (!target) return;
    void show(target.path).then(() => {
      const ed = editor.current!;
      ed.revealLineInCenter(target.line);
      ed.setSelection(new monaco.Range(target.line, 1, target.line, 1));
      ed.focus();
    });
  }, [props.reveal]);

  return (
    <section class="editor" aria-label="Editor">
      {tabs.length > 0 && (
        <div class="tabs editor-tabs" role="tablist" aria-label="Open files">
          {tabs.map((path) => (
            <button
              key={path}
              role="tab"
              class={`tab${props.dirty.has(path) ? ' dirty' : ''}`}
              aria-selected={path === active}
              title={path}
              onClick={() => props.onActivate(path)}
              onAuxClick={(e) => e.button === 1 && props.onClose(path)}
            >
              <FileIcon name={basename(path)} />
              {basename(path)}
              <span
                class="close"
                role="button"
                aria-label={`Close ${basename(path)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose(path);
                }}
              >
                {props.dirty.has(path) ? <span class="tab-dirty" title="Unsaved changes" /> : <Icon name="close" />}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <div class="banner">{error}</div>}
      <div class="monaco-host" ref={host} hidden={!active} />
      {!active && !review && !diffView && (
        <div class="watermark">
          <span class="logo">
            <LiverLogo size={96} />
          </span>
          <dl class="shortcut-list">
            <dt>Go to file</dt>
            <dd>
              <Keys keys={`${modKey()}+P`} />
            </dd>
            <dt>All commands</dt>
            <dd>
              <Keys keys={`${modKey()}+Shift+P`} />
            </dd>
            <dt>Search in files</dt>
            <dd>
              <Keys keys={`${modKey()}+Shift+F`} />
            </dd>
            <dt>Terminal</dt>
            <dd>
              <Keys keys={`${modKey()}+\``} />
            </dd>
            <dt>Agents to the center</dt>
            <dd>
              <Keys keys={`${modKey()}+Shift+A`} />
            </dd>
          </dl>
        </div>
      )}
      {diffView && !review && <ReadOnlyDiff key={diffView.path} view={diffView} onClose={props.onCloseDiff} />}
      {review && <DiffReview key={review.reviewId} review={review} pending={props.pendingReviews} />}
    </section>
  );
}

function useDiffEditor(
  host: { current: HTMLDivElement | null },
  key: string,
  original: string,
  modified: string,
  path: string,
  diffOptions: monaco.editor.IStandaloneDiffEditorConstructionOptions,
) {
  const diff = useRef<monaco.editor.IStandaloneDiffEditor | undefined>(undefined);
  useEffect(() => {
    const a = monaco.editor.createModel(original, undefined, monaco.Uri.parse(`friedliver-a:/${key}/${path}`));
    const b = monaco.editor.createModel(modified, undefined, monaco.Uri.parse(`friedliver-b:/${key}/${path}`));
    const ed = monaco.editor.createDiffEditor(host.current!, { ...options(), renderSideBySide: true, ...diffOptions });
    ed.setModel({ original: a, modified: b });
    diff.current = ed;
    return () => {
      ed.dispose();
      a.dispose();
      b.dispose();
    };
  }, [key]);
  return diff;
}

function DiffReview({ review, pending }: { review: WriteReview; pending: number }) {
  const host = useRef<HTMLDivElement>(null);
  // The arrows between the sides undo one hunk at a time; Accept writes what's left.
  const diff = useDiffEditor(host, review.reviewId, review.before ?? '', review.after, review.path, {
    originalEditable: false,
    renderMarginRevertIcon: true,
  });
  const accept = () => void api.respondWrite(review.reviewId, true, diff.current!.getModifiedEditor().getValue());
  const reject = () => void api.respondWrite(review.reviewId, false);

  // Mod+Enter accepts while the review (or nothing else) has focus; the chat and task boxes keep their own Mod+Enter.
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const focus = document.activeElement;
      if (focus && focus !== document.body && !pane.current?.contains(focus)) return;
      e.preventDefault();
      e.stopPropagation();
      accept();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [review.reviewId]);

  return (
    <div class="overlay-pane" role="region" aria-label="Review agent edit" ref={pane}>
      <div class="review-bar">
        <span class="review-icon">
          <Icon name="shield" />
        </span>
        <strong>{review.before === null ? 'New file' : 'Agent edit'}</strong>
        <span class="path" title={review.path}>
          <FileIcon name={basename(review.path)} />
          {basename(review.path)}
        </span>
        {pending > 1 && (
          <span class="badge" data-tone="warn">
            {pending - 1} more
          </span>
        )}
        <span class="spacer" />
        <span class="hint fit" title="Undo single hunks with the arrows between the two sides">
          Undo single hunks with the arrows between the two sides
        </span>
        <button class="danger sm" onClick={reject}>
          <Icon name="close" />
          Reject
        </button>
        <button class="primary sm" onClick={accept} title={`Accept (${isMac() ? '⌘' : 'Ctrl'}+Enter)`}>
          <Icon name="check" />
          Accept
          <span class="kbd-hint">{isMac() ? '⌘↵' : 'Ctrl+↵'}</span>
        </button>
      </div>
      <div class="monaco-host" ref={host} />
    </div>
  );
}

function ReadOnlyDiff({ view, onClose }: { view: DiffView; onClose(): void }) {
  const host = useRef<HTMLDivElement>(null);
  useDiffEditor(host, `${view.title}-${view.path}`, view.original, view.modified, view.path, { readOnly: true, originalEditable: false });
  return (
    <div class="overlay-pane" role="region" aria-label={view.title}>
      <div class="review-bar" data-kind="diff">
        <span class="path" title={view.path}>
          <FileIcon name={basename(view.path)} />
          {basename(view.path)}
        </span>
        <span class="hint">{view.title}</span>
        <span class="spacer" />
        <button class="sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div class="monaco-host" ref={host} />
    </div>
  );
}
