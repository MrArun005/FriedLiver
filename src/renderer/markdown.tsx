import type { ComponentChildren } from 'preact';

// Just enough Markdown for agent replies: fenced code, inline code and bold.
// Built from elements, never innerHTML, so agent text can't inject markup.
export function Markdown({ text }: { text: string }) {
  const parts = text.split('```');
  return (
    <div class="md">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i}>
            <code>{part.replace(/^[\w+-]*\n/, '')}</code>
          </pre>
        ) : (
          <p key={i}>{inline(part)}</p>
        ),
      )}
    </div>
  );
}

/** Inline code and bold only, for one-line messages such as notices. */
export function Inline({ text }: { text: string }) {
  return <>{inline(text)}</>;
}

function inline(text: string): ComponentChildren[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 1) return <code key={i}>{token.slice(1, -1)}</code>;
    if (token.startsWith('**') && token.endsWith('**') && token.length > 3) return <strong key={i}>{token.slice(2, -2)}</strong>;
    return token;
  });
}
