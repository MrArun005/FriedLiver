import type * as acp from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { applyUpdate, type ChatItem } from '../src/renderer/chatState';

describe('applyUpdate', () => {
  it('joins consecutive message chunks into one reply', () => {
    let items: ChatItem[] = [{ kind: 'user', text: 'hi', images: [] }];
    for (const text of ['Hel', 'lo']) {
      items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
    }
    expect(items).toEqual([
      { kind: 'user', text: 'hi', images: [] },
      { kind: 'agent', text: 'Hello' },
    ]);
  });

  it('updates a tool call in place', () => {
    let items = applyUpdate([], { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Read a', status: 'pending' });
    items = applyUpdate(items, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
    expect(items).toEqual([{ kind: 'tool', id: 't1', title: 'Read a', toolKind: undefined, status: 'completed', locations: [] }]);
  });

  it('keeps one live plan per turn', () => {
    const plan = (status: 'pending' | 'completed'): acp.SessionUpdate => ({
      sessionUpdate: 'plan',
      entries: [{ content: 'step', priority: 'medium', status }],
    });
    let items = applyUpdate([{ kind: 'user', text: 'go', images: [] }], plan('pending'));
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'working' } });
    items = applyUpdate(items, plan('completed'));
    expect(items.filter((i) => i.kind === 'plan')).toEqual([{ kind: 'plan', entries: [{ content: 'step', status: 'completed' }] }]);
  });
});
