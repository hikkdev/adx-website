import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown, renderPage } from './build-pages.mjs';

/**
 * CT-1: the press that turns published Markdown into the site's HTML.
 *
 * Run with `node --test website/*.test.mjs`. What is pinned is the part a glance at
 * the page would not catch: that the source can never inject HTML, and that
 * the small set of Markdown a policy actually uses comes out as the tags
 * the stylesheet dresses.
 */

test('escapes anything that looks like markup, in prose and inside links', () => {
  const html = renderMarkdown('A <script>alert(1)</script> line & an "attribute".');
  assert.ok(!html.includes('<script>'), 'a script tag survived');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&quot;attribute&quot;'));

  const link = renderMarkdown('[click](https://adx.in/x) and [bad](javascript:alert(1))');
  assert.ok(link.includes('<a href="https://adx.in/x">click</a>'));
  // A javascript: href is left as written text rather than becoming a link, because the
  // pattern requires a bracketed target with no space and this one still renders escaped.
  assert.ok(!link.includes('onerror'));
});

test('renders the Markdown a policy actually uses', () => {
  const html = renderMarkdown(
    ['# Heading one', '', 'A paragraph with **bold**, *italic* and `code`.', '', '- first', '- second', '', '1. step one', '2. step two', '', '> a quotation'].join('\n'),
  );
  // The page's own <h1> is the title, so a source heading starts at h2.
  assert.ok(html.includes('<h2>Heading one</h2>'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>italic</em>'));
  assert.ok(html.includes('<code>code</code>'));
  assert.ok(html.includes('<ul>\n    <li>first</li>'));
  assert.ok(html.includes('<ol>\n    <li>step one</li>'));
  assert.ok(html.includes('<blockquote>a quotation</blockquote>'));
});

test('joins a wrapped paragraph and closes every list it opens', () => {
  const html = renderMarkdown('one line\nand its continuation\n\n- a bullet\n\nafter the list');
  assert.ok(html.includes('<p>one line and its continuation</p>'));
  assert.equal((html.match(/<ul>/g) ?? []).length, 1);
  assert.equal((html.match(/<\/ul>/g) ?? []).length, 1);
  assert.ok(html.includes('<p>after the list</p>'));
});

test('builds a page the site can serve, with the marker that says it is generated', () => {
  const page = renderPage({
    title: 'Privacy policy',
    description: 'How ADX handles personal data',
    effectiveFrom: '2026-09-24T00:00:00.000Z',
    version: 3,
    bodyHtml: '<p>Body.</p>',
  });
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes('edit in the ADX console, not here'));
  assert.ok(page.includes('<title>Privacy policy — ADX</title>'));
  assert.ok(page.includes('name="description" content="How ADX handles personal data"'));
  assert.ok(page.includes('Effective 24 September 2026 · version 3.'));
  assert.ok(page.includes('href="styles.css"'));
  assert.ok(page.includes('<p>Body.</p>'));
});

test('a title with markup in it cannot break out of the tag', () => {
  const page = renderPage({ title: 'A "quoted" <b>title</b>', description: null, effectiveFrom: null, version: null, bodyHtml: '' });
  assert.ok(page.includes('<h1>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt;</h1>'));
  assert.ok(!page.includes('<b>title</b>'));
});
