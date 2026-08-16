import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { tmpPath } from '../helpers.js';
import { isInvisibleCodepoint, sanitizeText } from '../../lib/rag/extractors/sanitize.js';
import { hasCJK, estimateTokensCJK } from '../../lib/rag/extractors/tokens.js';
import { cleanPdfText } from '../../lib/rag/extractors/pdf.js';
import { listEntries, readEntry, readEntryText } from '../../lib/rag/extractors/zip.js';
import { validateDocxXmlSafety, extractDocx } from '../../lib/rag/extractors/docx.js';
import { extractHtml } from '../../lib/rag/extractors/html.js';
import { extractRtf } from '../../lib/rag/extractors/rtf.js';
import { extractEpubFile } from '../../lib/rag/extractors/epub.js';
import { extractText } from '../../lib/rag/extractors/index.js';
import { readTextFile } from '../../lib/rag/extractors/text.js';

/**
 * Build a minimal STORED-method ZIP buffer (no compression) with the given
 * entries, so DOCX/EPUB fixtures can be constructed in-memory for tests.
 * @param {Array<{name: string, content: string}>} entries
 * @returns {Buffer}
 */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let count = 0;

  for (const { name, content } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + dataBuf.length;
    count += 1;
  }

  const cdStart = offset;
  const cdSize = centralParts.reduce((n, b) => n + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

const writeTmpBuffer = (relPath, buffer) => {
  const abs = tmpPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return abs;
};

describe('sanitize (port of book-to-skill/sanitize.py)', () => {
  it('flags zero-width, bidi, invisible-letter and tag-block code points', () => {
    expect(isInvisibleCodepoint(0x200b)).toBe(true); // ZERO WIDTH SPACE
    expect(isInvisibleCodepoint(0x200d)).toBe(true); // ZERO WIDTH JOINER
    expect(isInvisibleCodepoint(0x202e)).toBe(true); // RIGHT-TO-LEFT OVERRIDE
    expect(isInvisibleCodepoint(0x061c)).toBe(true); // ARABIC LETTER MARK
    expect(isInvisibleCodepoint(0x3164)).toBe(true); // HANGUL FILLER
    expect(isInvisibleCodepoint(0xe0000)).toBe(true); // tag block start
    expect(isInvisibleCodepoint(0xe007f)).toBe(true); // tag block end
    expect(isInvisibleCodepoint(0x41)).toBe(false); // 'A'
    expect(isInvisibleCodepoint(0x20000)).toBe(false); // CJK ext B (astral, kept)
  });

  it('strips invisible code points from text', () => {
    // \uDB40\uDC00 is U+E0000 (tag block start) — a surrogate pair; a literal
    // '\uE0000' would parse as U+E000 + '0' (JS \u escapes are 4 hex digits).
    expect(sanitizeText('a\u200bb\u202ec\uDB40\uDC00d')).toBe('abcd');
    expect(sanitizeText('hello world')).toBe('hello world');
    expect(sanitizeText('')).toBe('');
  });

  it('never throws and returns input unchanged on non-string', () => {
    expect(sanitizeText(null)).toBe(null);
    expect(sanitizeText(undefined)).toBe(undefined);
  });
});

describe('tokens (port of estimate_tokens)', () => {
  it('hasCJK detects CJK scripts', () => {
    expect(hasCJK('hello world')).toBe(false);
    expect(hasCJK('你好世界')).toBe(true);
    expect(hasCJK('')).toBe(false);
  });

  it('estimates Latin text by words/0.75', () => {
    expect(estimateTokensCJK('hello world foo')).toBe(4); // 3 words / 0.75
  });

  it('estimates pure CJK by chars/1.5', () => {
    expect(estimateTokensCJK('你好世界')).toBe(2); // 4 chars / 1.5
    expect(estimateTokensCJK('你'.repeat(15))).toBe(10); // 15 / 1.5
  });

  it('handles mixed Latin + CJK', () => {
    // latinWords=2 ('hello','world'), cjk=2 -> trunc(2/0.75 + 2/1.5) = 4
    expect(estimateTokensCJK('hello 你好 world')).toBe(4);
  });

  it('returns 0 for empty / non-string input', () => {
    expect(estimateTokensCJK('')).toBe(0);
    expect(estimateTokensCJK(null)).toBe(0);
  });
});

describe('pdf cleanPdfText (port of clean_pdftotext)', () => {
  it('strips repeated running headers and edge page numbers', () => {
    const text = [
      'Running Header\nBody line one\n7',
      'Running Header\nBody line two\n8',
      'Running Header\nBody line three\n9',
      'Running Header\nBody line four\n10',
    ].join('\f');
    expect(cleanPdfText(text)).toBe(
      'Body line one\nBody line two\nBody line three\nBody line four'
    );
  });

  it('joins words split across a line by a hyphen', () => {
    expect(cleanPdfText('hyphen-\nated')).toBe('hyphenated');
  });

  it('leaves short documents untouched', () => {
    const text = 'Only one page\nof content.';
    expect(cleanPdfText(text)).toBe(text);
  });
});

describe('zip (minimal central-directory reader)', () => {
  const buf = buildZip([
    { name: 'a.txt', content: 'alpha' },
    { name: 'dir/b.txt', content: 'beta' },
  ]);

  it('lists entries with names and offsets', () => {
    const entries = listEntries(buf);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
    expect(entries[0].compressionMethod).toBe(0);
  });

  it('reads stored entries as text', () => {
    expect(readEntryText(buf, 'a.txt')).toBe('alpha');
    expect(readEntryText(buf, 'dir/b.txt')).toBe('beta');
    expect(readEntry(buf, 'missing.txt')).toBe(null);
  });
});

describe('docx (XXE guard + stdlib fallback)', () => {
  const cleanDocx = buildZip([
    {
      name: 'word/document.xml',
      content:
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' +
        '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>' +
        '<w:tbl><w:tr>' +
        '<w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>' +
        '</w:tr></w:tbl>' +
        '</w:body></w:document>',
    },
  ]);

  it('validates clean archives without throwing', () => {
    expect(() => validateDocxXmlSafety(cleanDocx)).not.toThrow();
  });

  it('throws on DOCTYPE/ENTITY declarations (XXE defense)', () => {
    const evil = buildZip([
      {
        name: 'word/document.xml',
        content: '<!DOCTYPE foo [<!ENTITY x "y">]><w:document/>',
      },
    ]);
    expect(() => validateDocxXmlSafety(evil)).toThrow(/DOCTYPE|ENTITY|Security/);
  });

  it('extracts paragraphs and tab-joined table rows in order', () => {
    expect(extractDocx(cleanDocx)).toBe('Hello\nA\tB');
  });

  it('returns null for a missing document part', () => {
    expect(extractDocx(buildZip([{ name: 'word/empty.xml', content: '<x/>' }]))).toBe(null);
  });
});

describe('html (port of _HTMLTextExtractor)', () => {
  it('skips script/style and separates blocks and table cells', async () => {
    const html =
      '<html><head><style>body{}</style></head><body>' +
      '<h2>Chapter 1</h2><p>Intro</p>' +
      '<table><tr><td>A</td><td>B</td></tr></table>' +
      '<script>evil()</script>' +
      '</body></html>';
    const text = await extractHtml(html);
    expect(text).toBe('Chapter 1\nIntro\nA\tB');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('style');
  });

  it('returns empty for empty input', async () => {
    expect(await extractHtml('')).toBe('');
  });
});

describe('rtf (port of rtf.py)', () => {
  it('strips metadata tables and decodes control words', () => {
    // Realistic RTF: control words are followed by a delimiter (space, digit
    // or '\{') so the greedy control-word cleanup never eats document text.
    const raw = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0\fnil Calibri;}}{\info{\title Untitled}}\viewkind4\uc1\pard Hello \par World\par}`;
    const text = extractRtf(raw);
    expect(text).toMatch(/Hello\s*\n\s*World/);
    expect(text).not.toContain('fonttbl');
    expect(text).not.toContain('info');
    expect(text).not.toContain('Calibri');
  });

  it('decodes \\uN unicode escapes', () => {
    // \u233 is U+00E9 (é) with a fallback '?'
    expect(extractRtf(String.raw`caf\u233?`)).toContain('café');
  });
});

describe('epub (OPF spine-aware extractor)', () => {
  const epub = buildZip([
    {
      name: 'META-INF/container.xml',
      content:
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
        '</rootfiles></container>',
    },
    {
      name: 'OEBPS/content.opf',
      content:
        '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">' +
        '<metadata><dc:title>Sample</dc:title></metadata>' +
        '<manifest>' +
        '<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>' +
        '</manifest>' +
        '<spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>' +
        '</package>',
    },
    {
      name: 'OEBPS/ch1.xhtml',
      content: '<html><body><h1>Chapter One</h1><p>First chapter text.</p></body></html>',
    },
    {
      name: 'OEBPS/ch2.xhtml',
      content: '<html><body><h1>Chapter Two</h1><p>Second chapter text.</p></body></html>',
    },
  ]);

  it('extracts chapters in OPF spine order', async () => {
    const file = writeTmpBuffer('rag/sample.epub', epub);
    const text = await extractEpubFile(file);
    expect(text).toBe('Chapter One\nFirst chapter text.\n\nChapter Two\nSecond chapter text.');
  });
});

describe('dispatcher + text reader', () => {
  it('routes .rtf through the RTF extractor', async () => {
    const file = writeTmpBuffer(
      'rag/sample.rtf',
      Buffer.from(String.raw`{\rtf1\ansi\pard Hello \par}`)
    );
    expect(await extractText(file, '.rtf')).toContain('Hello');
  });

  it('routes .html through the HTML extractor', async () => {
    const file = writeTmpBuffer(
      'rag/sample.html',
      Buffer.from('<html><body><p>Hello</p></body></html>')
    );
    expect(await extractText(file, '.html')).toBe('Hello');
  });

  it('falls back to BOM-aware UTF-16 text reading', () => {
    // 'héllo' encoded as UTF-16LE with BOM
    const bom = Buffer.from([0xff, 0xfe]);
    const body = Buffer.from('héllo', 'utf16le');
    const file = writeTmpBuffer('rag/sample-utf16.txt', Buffer.concat([bom, body]));
    expect(readTextFile(file)).toBe('héllo');
  });

  it('returns empty string for unknown extensions with unreadable content', async () => {
    const file = writeTmpBuffer('rag/sample.bin', Buffer.from([0x00, 0x01, 0x02]));
    const text = await extractText(file, '.bin');
    expect(typeof text).toBe('string');
  });
});
