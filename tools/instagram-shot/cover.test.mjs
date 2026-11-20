import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildCoverHtml, renderCover } from './cover.mjs';

async function mascotFixture(t, name = 'holiday pip.SVG', bytes = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4" fill="orange"/></svg>',
)) {
  const dir = await mkdtemp(join(tmpdir(), 'popups-mascot-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, name);
  await writeFile(file, bytes);
  return { file, bytes };
}

test('cover uses the supplied city and the same date label as the caption', async () => {
  for (const cityName of ['Seattle', 'San Francisco']) {
    const html = await buildCoverHtml({ cityName, dateLabel: 'Sep 17–22' });
    assert.ok(html.includes(`aria-label="Pop-Ups in ${cityName} for Sep 17–22"`));
    assert.ok(html.includes('class="glyph"'));
    assert.ok(!/\{\{[A-Z]+\}\}/.test(html));
    assert.ok(!html.includes('<script'));
  }
});

test('letter jitter is deterministic and the approved font and arrow are retained', async () => {
  const options = { cityName: 'San Francisco', dateLabel: 'Sep 10–15' };
  const html = await buildCoverHtml(options);
  assert.equal(html, await buildCoverHtml(options));
  assert.ok(html.includes("font-family: 'Indie Flower'"));
  assert.ok(html.includes('class="arrow-shaft" aria-hidden="true">-</span>'));
  assert.ok(html.includes('class="arrow-head" aria-hidden="true">&gt;</span>'));
});

test('the original mascot is embedded without depending on the preview or site URL', async () => {
  const html = await buildCoverHtml({ cityName: 'Seattle', dateLabel: 'this week' });
  const encoded = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html)?.[1];
  assert.ok(encoded);
  assert.deepEqual(
    Buffer.from(encoded, 'base64'),
    await readFile(new URL('../../public/logo.svg', import.meta.url)),
  );
  assert.ok(!html.includes('cover-sample'));
});

test('a local SVG mascot overrides only that cover and preserves the source bytes', async (t) => {
  const { file, bytes } = await mascotFixture(t);
  const html = await buildCoverHtml({
    cityName: 'Seattle', dateLabel: 'Oct 15–20', mascotPath: file,
  });
  const encoded = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html)?.[1];
  assert.ok(encoded);
  assert.deepEqual(Buffer.from(encoded, 'base64'), bytes);
  const defaultHtml = await buildCoverHtml({ cityName: 'Seattle', dateLabel: 'Oct 15–20' });
  assert.notEqual(defaultHtml, html);
  assert.ok(defaultHtml.includes((await readFile(new URL('../../public/logo.svg', import.meta.url))).toString('base64')));
});

test('PNG mascots supplied as file URLs get the correct MIME type', async (t) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=', 'base64');
  const { file, bytes } = await mascotFixture(t, 'holiday pip.PNG', png);
  const html = await buildCoverHtml({
    cityName: 'San Francisco', dateLabel: 'Oct 15–20', mascotPath: pathToFileURL(file),
  });
  assert.ok(html.includes(`src="data:image/png;base64,${bytes.toString('base64')}"`));
});

test('unsupported and missing mascot files fail rather than using the default', async (t) => {
  const { file } = await mascotFixture(t);
  const options = { cityName: 'Seattle', dateLabel: 'Oct 15–20' };
  await assert.rejects(buildCoverHtml({ ...options, mascotPath: `${file}.txt` }), /SVG, PNG, JPG, or WebP/);
  await assert.rejects(buildCoverHtml({ ...options, mascotPath: `${file}.missing.svg` }), { code: 'ENOENT' });
});

test('dynamic text is HTML-escaped, including in the accessible heading', async () => {
  const html = await buildCoverHtml({
    cityName: 'A & "B" <City>',
    dateLabel: 'Sep 17</span><script>bad()</script>',
  });
  assert.ok(html.includes('A &amp; &quot;B&quot; &lt;City&gt;'));
  assert.ok(!html.includes('<City>'));
  assert.ok(!html.includes('<script>bad()'));
});

test('missing cover labels fail explicitly', async () => {
  await assert.rejects(buildCoverHtml({ cityName: 'Seattle' }), /city and date label/);
  await assert.rejects(buildCoverHtml({ dateLabel: 'Sep 17–22' }), /city and date label/);
});

function fakeBrowser({ clipped = [], screenshotError } = {}) {
  const calls = {};
  const page = {
    setDefaultTimeout(value) { calls.timeout = value; },
    async setContent(html, options) { calls.html = html; calls.loadOptions = options; },
    async evaluate() { return clipped; },
    locator(selector) {
      calls.selector = selector;
      return {
        async screenshot(options) {
          calls.screenshot = options;
          if (screenshotError) throw screenshotError;
        },
      };
    },
    async close() { calls.closed = true; },
  };
  return {
    calls,
    browser: { async newPage(options) { calls.pageOptions = options; return page; } },
  };
}

test('renderCover passes the selected mascot through to the saved cover', async (t) => {
  const { file, bytes } = await mascotFixture(t);
  const { browser, calls } = fakeBrowser();
  await renderCover(browser, {
    cityName: 'Seattle', dateLabel: 'Oct 15–20', mascotPath: file,
    size: { width: 1080, height: 1350 }, outputPath: 'halloween-cover.jpg',
  });
  assert.ok(calls.html.includes(`src="data:image/svg+xml;base64,${bytes.toString('base64')}"`));
  assert.equal(calls.screenshot.path, 'halloween-cover.jpg');
  assert.equal(calls.closed, true);
});

test('portrait, square, and story covers match their map dimensions and use JPG', async () => {
  for (const height of [1350, 1080, 1920]) {
    const { browser, calls } = fakeBrowser();
    await renderCover(browser, {
      cityName: 'Seattle', dateLabel: 'Sep 17–22',
      size: { width: 1080, height }, outputPath: 'custom-name-cover.jpg', timeout: 12000,
    });
    assert.deepEqual(calls.pageOptions.viewport, { width: 540, height: height / 2 });
    assert.equal(calls.pageOptions.deviceScaleFactor, 2);
    assert.equal(calls.timeout, 12000);
    assert.deepEqual(calls.loadOptions, { waitUntil: 'load', timeout: 12000 });
    assert.equal(calls.selector, '.cover');
    assert.deepEqual(calls.screenshot, {
      path: 'custom-name-cover.jpg', type: 'jpeg', quality: 98,
      animations: 'disabled', scale: 'device',
    });
    assert.equal(calls.closed, true);
  }
});

test('clipped artwork is rejected before saving and the cover page is closed', async () => {
  const { browser, calls } = fakeBrowser({ clipped: ['glyph'] });
  await assert.rejects(renderCover(browser, {
    cityName: 'Seattle', dateLabel: 'Sep 17–22',
    size: { width: 1080, height: 1350 }, outputPath: 'test-cover.jpg',
  }), /Cover layout would clip/);
  assert.equal(calls.screenshot, undefined);
  assert.equal(calls.closed, true);
});

test('a screenshot failure still closes the cover page', async () => {
  const { browser, calls } = fakeBrowser({ screenshotError: new Error('cannot save image') });
  await assert.rejects(renderCover(browser, {
    cityName: 'Seattle', dateLabel: 'Sep 17–22',
    size: { width: 1080, height: 1350 }, outputPath: 'test-cover.jpg',
  }), /cannot save image/);
  assert.equal(calls.closed, true);
});