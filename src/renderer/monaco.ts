// Only the editor core, its features and syntax highlighting. Monaco's bundled
// TypeScript/JSON/CSS language services are left out on purpose: each runs a
// worker that costs tens of MB, and the MVP doesn't need them.
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/register.all.js';
import 'monaco-editor/languages/definitions/register.all.js';

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new Worker(new URL('editor.worker.js', location.href)),
};

export { monaco };
