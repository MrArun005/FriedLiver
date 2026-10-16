import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';
import { monaco } from './monaco';

export interface WriteReview {
  reviewId: string;
  path: string;
  before: string | null;
  after: string;
}

// No `theme` here: themes.ts sets one global Monaco theme that matches the app.
const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
};

/** The file editor, swapped for a diff view while an agent edit waits for review. */
export function EditorPane({
  file,
  review,
  pendingReviews,
  changedFile,
  onSaved,
}: {
  file: string | null;
  review: WriteReview | null;
  pendingReviews: number;
  changedFile: { path: string; n: number } | null;
  onSaved(path: string): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  const savedVersion = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, { ...OPTIONS, model: null });
    editor.current = ed;
    const sub = ed.onDidChangeModelContent(() => {
      setDirty(ed.getModel()?.getAlternativeVersionId() !== savedVersion.current);
    });
    return () => {
      sub.dispose();
      ed.dispose();
    };
  }, []);

  const load = async (path: string) => {
    const uri = monaco.Uri.file(path);
    try {
      const text = await api.readFile(path);
      const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(text, undefined, uri);
      if (model.getValue() !== text) model.setValue(text);
      editor.current!.setModel(model);
      savedVersion.current = model.getAlternativeVersionId();
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (file) void load(file);
  }, [file]);

  // An accepted agent edit reloads the open file, unless the user has unsaved changes.
  useEffect(() => {
    if (changedFile && changedFile.path === file && !dirty) void load(file);
  }, [changedFile]);

  useEffect(() => {
    const ed = editor.current!;
    const action = ed.addAction({
      id: 'friedliver.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: async () => {
        const model = ed.getModel();
        if (!model || !file) return;
        await api.writeFile(file, model.getValue());
        savedVersion.current = model.getAlternativeVersionId();
        setDirty(false);
        onSaved(file);
      },
    });
    return () => action.dispose();
  }, [file]);

  return (
    <section class="editor" aria-label="Editor">
      <div class="pane-title">
        {file ? (
          <>
            {file.split(/[\\/]/).pop()}
            {dirty && <span class="dirty" title="Unsaved changes"> ●</span>}
            <span class="hint">Ctrl/Cmd+S to save</span>
          </>
        ) : (
          'No file open'
        )}
      </div>
      {error && <div class="banner error">{error}</div>}
      <div class="monaco-host" ref={host} hidden={!file} />
      {!file && !review && <div class="empty">Open a file from the tree on the left.</div>}
      {review && <DiffReview key={review.reviewId} review={review} pending={pendingReviews} />}
    </section>
  );
}

function DiffReview({ review, pending }: { review: WriteReview; pending: number }) {
  const host = useRef<HTMLDivElement>(null);
  const diff = useRef<monaco.editor.IStandaloneDiffEditor | undefined>(undefined);

  useEffect(() => {
    const original = monaco.editor.createModel(review.before ?? '', undefined, monaco.Uri.parse(`review-before:${review.reviewId}/${review.path}`));
    const modified = monaco.editor.createModel(review.after, undefined, monaco.Uri.parse(`review-after:${review.reviewId}/${review.path}`));
    const ed = monaco.editor.createDiffEditor(host.current!, {
      ...OPTIONS,
      originalEditable: false,
      renderSideBySide: true,
      // The arrows between the sides undo one hunk at a time; Accept writes what's left.
      renderMarginRevertIcon: true,
    });
    ed.setModel({ original, modified });
    diff.current = ed;
    return () => {
      ed.dispose();
      original.dispose();
      modified.dispose();
    };
  }, [review.reviewId]);

  const accept = () => void api.respondWrite(review.reviewId, true, diff.current!.getModifiedEditor().getValue());
  const reject = () => void api.respondWrite(review.reviewId, false);

  return (
    <div class="review">
      <div class="review-bar">
        <strong>{review.before === null ? 'New file' : 'Agent edit'}</strong>
        <span class="path" title={review.path}>
          {review.path.split(/[\\/]/).pop()}
        </span>
        {pending > 1 && <span class="hint">{pending - 1} more waiting</span>}
        <span class="spacer" />
        <span class="hint fit" title="Undo single hunks with the arrows between the two sides">
          Undo single hunks with the arrows between the two sides
        </span>
        <button class="primary" onClick={accept}>
          Accept
        </button>
        <button onClick={reject}>Reject</button>
      </div>
      <div class="monaco-host" ref={host} />
    </div>
  );
}
