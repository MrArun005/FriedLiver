// Drives the real app through every major feature and saves screenshots.
//
//   npm run build && node scripts/ui-tour.mjs [outDir]
//
// Runs on a git-initialized copy of bench/fixture, with a fresh profile, so it
// never touches the fixture or your settings. On Linux without a display:
// xvfb-run -a node scripts/ui-tour.mjs
//
// FRIEDLIVER_EXECUTABLE=release/linux-unpacked/friedliver runs it against a packaged build.
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'ui-tour'));
const folder = await mkdtemp(path.join(os.tmpdir(), 'friedliver-tour-'));
await cp(path.join(root, 'bench', 'fixture'), folder, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: folder, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'tour@example.com');
git('config', 'user.name', 'Tour');
git('add', '-A');
git('commit', '-q', '-m', 'Fixture');

const packaged = process.env.FRIEDLIVER_EXECUTABLE;
const args = [...(packaged ? [] : ['.']), '--folder', folder];
if (process.getuid?.() === 0) args.push('--no-sandbox');
const profile = await mkdtemp(path.join(os.tmpdir(), 'friedliver-profile-'));
// The demo agent's stand-in login (like `claude /login`) records itself here.
const loginMarker = path.join(profile, 'demo-login');
const env = { ...process.env, FRIEDLIVER_USER_DATA: profile, FAKE_AGENT_LOGIN_MARKER: loginMarker };
// Some containers set this, and Gemini then refuses to open a browser; desktops don't.
delete env.DEBIAN_FRONTEND;
const app = await electron.launch({
  executablePath: packaged ? path.resolve(packaged) : require('electron'),
  args,
  cwd: root,
  env,
});
const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const shot = async (name) => {
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`saved ${name}.png`);
};
const tree = (name) => win.locator('.tree .row', { hasText: name }).first();
const agentSelect = () => win.getByLabel('Agent', { exact: true });

/** Accepts every review and runs every command until `doneText` appears. */
async function approveUntil(doneText, onReview) {
  const done = win.getByText(doneText).first();
  while (!(await done.isVisible())) {
    if (await win.locator('.review-bar button.primary').isVisible()) {
      await onReview?.();
      await win.locator('.review-bar button.primary').click();
    } else if (await win.locator('.command[data-state="awaiting"]').first().isVisible()) {
      await win.locator('.command[data-state="awaiting"] button.primary').first().click();
    }
    await win.waitForTimeout(150);
  }
}

try {
  await win.waitForSelector('.app');
  // 0. First look: the empty editor and the agent picker.
  await shot('00-start');

  // 1. Files, tabs and the editor.
  await tree('src').click();
  await tree('inventory.ts').click();
  await tree('format.ts').click();
  await win.locator('.editor-tabs .tab', { hasText: 'inventory.ts' }).click();
  await win.waitForSelector('.monaco-editor .view-lines');
  await shot('01-editor-tabs');

  // 2. Quick open.
  await win.keyboard.press(`${mod}+P`);
  await win.locator('.palette input').fill('main');
  await shot('02-quick-open');
  await win.keyboard.press('Enter');

  // 3. A real terminal.
  await win.keyboard.press(`${mod}+\``);
  await win.waitForSelector('.terminal-host .xterm');
  await win.waitForTimeout(800);
  await win.keyboard.type('echo "hello from $SHELL" && node --version');
  await win.keyboard.press('Enter');
  await win.locator('.xterm-rows', { hasText: 'hello from' }).first().waitFor();
  await shot('03-terminal');

  // 4. The demo agent's tour in the main folder: reviewed edit, approved command, image.
  await agentSelect().selectOption('demo');
  await win.getByRole('button', { name: 'New chat' }).click();
  await win.locator('.composer textarea').fill('tour');
  await win.locator('.composer textarea').press('Enter');
  let reviewShot = false;
  await approveUntil("That's the tour", async () => {
    if (!reviewShot) {
      await shot('04-diff-review');
      reviewShot = true;
    }
  });
  await win.getByText('Changed 1 file').waitFor();
  await shot('05-turn-changes');

  // 5. Git: the new NOTES.md shows up; open its diff against HEAD.
  await win.getByRole('button', { name: /Source control/ }).first().click();
  await win.locator('.git-file', { hasText: 'NOTES.md' }).click();
  await win.waitForSelector('.overlay-pane .monaco-diff-editor');
  await shot('06-git-diff');
  await win.locator('.overlay-pane').getByRole('button', { name: 'Close' }).click();

  // 6. Undo the agent's turn: NOTES.md goes away again.
  await win.getByRole('button', { name: 'Undo this turn' }).click();
  await win.getByText('Turn undone').waitFor();
  await win.locator('.git-file', { hasText: 'NOTES.md' }).waitFor({ state: 'detached' });
  await shot('07-turn-undone');

  // 7. Agents in the center, a task in its own worktree: build, test, fix, run.
  await win.getByRole('button', { name: 'Center', exact: true }).click();
  await win.getByRole('tab', { name: /Tasks/ }).click();
  await win.getByLabel('Task description').fill('project');
  await win.getByLabel('Agent for the task').selectOption('demo');
  await win.getByLabel('Own worktree').check();
  await win.getByRole('button', { name: 'Start' }).click();
  let fixShot = false;
  await approveUntil('The app works', async () => {
    if (!fixShot && (await win.locator('.review-bar').textContent()).includes('Agent edit')) {
      await shot('08-center-fix-review');
      fixShot = true;
    }
  });
  await shot('09-center-project-done');
  await win.getByRole('tab', { name: /Tasks/ }).click();
  await shot('10-tasks');
  await win.getByRole('button', { name: 'Merge into main checkout' }).click();
  await win.getByText('Merged into the main checkout').waitFor();
  await shot('11-merged');
  await win.getByRole('button', { name: 'Side', exact: true }).click();

  // 8. Search across files.
  await win.keyboard.press(`${mod}+Shift+F`);
  await win.getByLabel('Search in files').fill('multiply');
  await win.locator('.result-line').first().waitFor();
  await shot('12-search');
  await win.locator('.result-line').first().click();

  // 9. Settings and command palette.
  await win.keyboard.press(`${mod}+,`);
  await win.getByRole('dialog', { name: 'Settings' }).waitFor();
  await shot('13-settings');
  await win.keyboard.press('Escape');
  await win.keyboard.press(`${mod}+Shift+P`);
  await win.locator('.palette input').fill('theme');
  await shot('14-command-palette');
  await win.keyboard.press('Escape');

  // 10. Fonts: the bundled Inter and JetBrains Mono, with the live preview in Settings.
  await win.keyboard.press(`${mod}+,`);
  await win.getByRole('dialog', { name: 'Settings' }).waitFor();
  await win.getByLabel('Font preview').scrollIntoViewIfNeeded();
  await shot('17-fonts');

  // 11. Accounts. Claude is pointed at the demo agent's stand-in login so the
  // terminal flow can run without a real account.
  await win.evaluate(
    (script) => window.friedliver.updateSettings({ agents: { claude: { command: 'node', args: [script, '--require-login'] } } }),
    path.join(root, 'dist', 'demo-agent.js'),
  );
  await win.keyboard.press('Escape');
  await win.keyboard.press(`${mod}+,`);
  const rows = win.locator('.account-row');
  for (let i = 0; i < 3; i++) await rows.nth(i).getByRole('button', { name: 'Check' }).click();
  await win.waitForFunction(() => document.querySelectorAll('.account-row .status-text .dot[data-state="working"]').length === 0, null, { timeout: 90_000 });
  await shot('18-accounts');

  // Login with ChatGPT: Codex opens OpenAI's authorize page and waits (only where Codex is installed).
  const chatgpt = win.getByRole('button', { name: 'Login with ChatGPT' });
  if (await chatgpt.isVisible()) {
    await chatgpt.click();
    await win.locator('.sign-in-card').getByText('Finish in the browser').waitFor();
    await shot('19-chatgpt-sign-in');
    await win.locator('.sign-in-card').getByRole('button', { name: 'Cancel' }).click();
  }

  // Terminal login (Claude's kind): the agent's own CLI runs in a FriedLiver terminal.
  await rows.nth(0).getByRole('button', { name: 'Log in with Demo' }).click();
  await win.locator('.xterm-rows', { hasText: 'Press Enter' }).first().waitFor();
  await shot('20-terminal-sign-in');
  await win.locator('.terminal-host:not([hidden]) .xterm-helper-textarea').focus();
  await win.keyboard.press('Enter');
  await win.locator('.sign-in-card').getByText('Signed in to Claude').waitFor();
  await shot('21-signed-in');
  await win.keyboard.press(`${mod}+,`);
  await rows.nth(0).getByRole('button', { name: /Check/ }).click();
  await rows.nth(0).getByText('Signed in').waitFor({ timeout: 30_000 });
  await shot('22-accounts-after');
  await win.keyboard.press('Escape');
  await win.evaluate(() => window.friedliver.updateSettings({ agents: {} }));

  // 12. Real agents without a login here: Gemini offers sign-in, Claude isn't installed.
  await win.getByRole('tab', { name: 'Chat' }).click();
  for (const agent of ['gemini', 'claude']) {
    await agentSelect().selectOption(agent);
    await win.getByRole('button', { name: 'New chat' }).click();
    await win.locator('.composer textarea').fill('hi');
    await win.locator('.composer textarea').press('Enter');
    await win.locator('.callout[data-tone="error"]').last().waitFor({ timeout: 60_000 });
    await shot(`15-${agent}-sign-in`);
  }

  // 13. Every theme on the same screen.
  await win.locator('.editor-tabs .tab', { hasText: 'inventory.ts' }).click();
  for (const theme of ['black-blue', 'midnight-blue', 'graphite', 'daylight-blue']) {
    await win.getByLabel('Theme', { exact: true }).selectOption(theme);
    await shot(`16-theme-${theme}`);
  }
  await win.getByLabel('Theme', { exact: true }).selectOption('black-blue');
} catch (err) {
  await shot('error').catch(() => {});
  throw err;
} finally {
  await app.close();
}
