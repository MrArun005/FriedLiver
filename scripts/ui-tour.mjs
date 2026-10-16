// Drives the real app through the demo agent's tour and saves screenshots.
//
//   npm run build && node scripts/ui-tour.mjs [outDir]
//
// Runs on a copy of bench/fixture so the tour's edit never touches the fixture.
// On Linux without a display, wrap it: xvfb-run -a node scripts/ui-tour.mjs
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

const args = ['.', '--folder', folder];
if (process.getuid?.() === 0) args.push('--no-sandbox');
const profile = await mkdtemp(path.join(os.tmpdir(), 'friedliver-profile-'));
const app = await electron.launch({
  executablePath: require('electron'),
  args,
  cwd: root,
  env: { ...process.env, FRIEDLIVER_USER_DATA: profile },
});
const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 });
const shot = async (name) => {
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`saved ${name}.png`);
};

try {
  await win.waitForSelector('.app');
  await win.getByRole('button', { name: 'src' }).click();
  await win.getByRole('button', { name: 'inventory.ts' }).click();
  await win.waitForSelector('.monaco-editor .view-lines');
  await shot('1-editor');

  await win.getByLabel('Agent', { exact: true }).selectOption('demo');
  await win.getByRole('button', { name: 'New chat' }).click();
  await win.locator('.composer textarea').fill('tour');
  await win.locator('.composer textarea').press('Enter');

  await win.waitForSelector('.review-bar');
  await shot('2-diff-review');
  await win.getByRole('button', { name: 'Accept' }).click();

  await win.waitForSelector('.command.awaiting');
  await shot('3-command-approval');
  await win.getByRole('button', { name: 'Run', exact: true }).click();

  await win.getByText("That's the tour").waitFor();
  await win.getByRole('button', { name: 'NOTES.md' }).click();
  await shot('4-tour-done');

  await win.getByRole('tab', { name: /Images/ }).click();
  await shot('5-images');
  await win.getByRole('tab', { name: 'Chat' }).click();

  for (const agent of ['gemini', 'claude']) {
    await win.getByLabel('Agent', { exact: true }).selectOption(agent);
    await win.getByRole('button', { name: 'New chat' }).click();
    await win.locator('.composer textarea').fill('hi');
    await win.locator('.composer textarea').press('Enter');
    await win.locator('.notice.error').last().waitFor({ timeout: 60_000 });
    await shot(`6-${agent}-sign-in`);
  }

  // Every theme, on the same screen: the demo chat with its diff-reviewed file open.
  await win.getByRole('tab', { name: /Demo/ }).click();
  await win.getByRole('button', { name: 'inventory.ts' }).click();
  for (const theme of ['black-blue', 'midnight-blue', 'graphite', 'daylight-blue']) {
    await win.getByLabel('Theme').selectOption(theme);
    await shot(`7-theme-${theme}`);
  }
  await win.getByLabel('Theme').selectOption('black-blue');

  // Agents in the center, building and testing a small project.
  await win.getByRole('button', { name: '⇤ Center' }).click();
  await win.getByLabel('Agent', { exact: true }).selectOption('demo');
  await win.getByRole('button', { name: 'New chat' }).click();
  await win.locator('.composer textarea').fill('project');
  await win.locator('.composer textarea').press('Enter');
  let reviewShot = false;
  const done = win.getByText('The app works');
  while (!(await done.isVisible())) {
    if (await win.locator('.review-bar').isVisible()) {
      if (!reviewShot && (await win.locator('.review-bar').textContent()).includes('Agent edit')) {
        await shot('8-center-fix-review');
        reviewShot = true;
      }
      await win.getByRole('button', { name: 'Accept' }).click();
    } else if (await win.locator('.command.awaiting').isVisible()) {
      await win.getByRole('button', { name: 'Run', exact: true }).click();
    }
    await win.waitForTimeout(150);
  }
  await win.getByRole('button', { name: 'calc', exact: true }).click();
  // calc's children load asynchronously; wait for them so 'src' means calc/src.
  await win.getByRole('button', { name: 'test', exact: true }).waitFor();
  await win.getByRole('button', { name: 'src', exact: true }).first().click();
  await win.getByRole('button', { name: 'calc.js' }).click();
  await shot('9-center-project-done');
  await win.getByRole('button', { name: 'Side ⇥' }).click();
} catch (err) {
  await shot('error').catch(() => {});
  throw err;
} finally {
  await app.close();
}
