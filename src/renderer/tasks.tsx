import { useState } from 'preact/hooks';
import type { AgentKey, AgentOption } from '../shared/ipc';
import type { Chat, ChatStatus } from './chatState';
import { IconButton } from './ui';

const STATUS_LABEL: Record<ChatStatus, string> = {
  idle: 'Not started',
  working: 'Working',
  'needs-you': 'Needs you',
  done: 'Done',
  error: 'Problem',
};

/**
 * The Agent Manager: every chat as a task, with what it's doing at a glance.
 * New tasks can run in their own git worktree so parallel agents don't collide.
 */
export function TasksView({
  agents,
  chats,
  statusOf,
  onOpen,
  onCreate,
  onStop,
  onMerge,
  onRemove,
}: {
  agents: AgentOption[];
  chats: Chat[];
  statusOf(chat: Chat): ChatStatus;
  onOpen(chatId: string): void;
  onCreate(agent: AgentKey, prompt: string, worktree: boolean): void;
  onStop(chatId: string): void;
  onMerge(chatId: string): void;
  onRemove(chatId: string): void;
}) {
  const [agent, setAgent] = useState<AgentKey>('demo');
  const [prompt, setPrompt] = useState('');
  const [worktree, setWorktree] = useState(false);
  const counts = chats.reduce<Record<string, number>>((acc, c) => ((acc[statusOf(c)] = (acc[statusOf(c)] ?? 0) + 1), acc), {});

  const create = () => {
    if (!prompt.trim()) return;
    onCreate(agent, prompt.trim(), worktree);
    setPrompt('');
  };

  return (
    <div class="tasks">
      <div class="task-new">
        <strong>New task</strong>
        <textarea
          value={prompt}
          placeholder="Describe the task. Try “project” with the Demo agent."
          aria-label="Task description"
          onInput={(e) => setPrompt(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) create();
          }}
        />
        <div class="row">
          <select value={agent} onChange={(e) => setAgent(e.currentTarget.value as AgentKey)} aria-label="Agent for the task">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <label class="check" title="Runs in a separate git checkout on its own branch, so it can't clash with other agents">
            <input type="checkbox" checked={worktree} onChange={(e) => setWorktree(e.currentTarget.checked)} />
            Own worktree
          </label>
          <span class="spacer" />
          <button class="primary" disabled={!prompt.trim()} onClick={create}>
            Start
          </button>
        </div>
      </div>

      {chats.length > 0 && (
        <div class="hint">
          {Object.entries(counts)
            .map(([s, n]) => `${n} ${STATUS_LABEL[s as ChatStatus].toLowerCase()}`)
            .join(' · ')}
        </div>
      )}
      {chats.length === 0 && <div class="empty compact">No tasks yet. Every chat shows up here with its status.</div>}

      {[...chats].reverse().map((c) => {
        const status = statusOf(c);
        return (
          // Not role=button: that would hide the action buttons inside from assistive tech.
          <div key={c.id} class="task" onClick={() => onOpen(c.id)}>
            <span class="dot" data-state={status} />
            <button class="link task-title" title={c.title} onClick={(e) => (e.stopPropagation(), onOpen(c.id))}>
              {c.title}
            </button>
            <span class="actions">
              <span class="task-state">{STATUS_LABEL[status]}</span>
              {c.busy && <IconButton icon="stop" label="Stop" size="sm" onClick={() => onStop(c.id)} />}
              {c.branch && !c.busy && <IconButton icon="merge" label="Merge into main checkout" size="sm" onClick={() => onMerge(c.id)} />}
              {c.branch && !c.busy && <IconButton icon="trash" label="Delete worktree" size="sm" onClick={() => onRemove(c.id)} />}
            </span>
            <span class="task-sub">
              {c.label}
              {c.branch ? ` · ${c.branch}` : ''}
              {c.changedFiles ? ` · ${c.changedFiles} file${c.changedFiles === 1 ? '' : 's'} changed` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
