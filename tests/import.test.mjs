import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, unguard, collectionCSV } from '../src/util/csv.js';
import { mapHeaders, readList, rowToStamp, parseCatalogue, normGum } from '../src/app/importer.js';

const STATUSES = [{ id: 'keep', label: 'Keeping' }, { id: 'sell', label: 'For sale' }, { id: 'sold', label: 'Sold' }];

test('parseCSV handles quotes, doubled quotes, line breaks and a byte order mark', () => {
  const rows = parseCSV('﻿a,b,c\r\n1,"two, 2","say ""hi"""\n3,"line\nbreak",\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'two, 2', 'say "hi"'], ['3', 'line\nbreak', '']]);
  assert.deepEqual(parseCSV('x;y\n1;2'), [['x', 'y'], ['1', '2']], 'semicolon files');
  assert.deepEqual(parseCSV('x\ty\n1\t2'), [['x', 'y'], ['1', '2']], 'tab files');
  assert.equal(unguard("'=SUM(A1)"), '=SUM(A1)');
  assert.equal(unguard("'hello"), "'hello");
});

test('headers in English, German and Colnect style are matched', () => {
  const m = mapHeaders(['Country', 'Issued on', 'Name', 'FaceValue', 'Currency', 'Catalog Codes', 'Colors', 'Paper']);
  assert.deepEqual(m.fields, ['country', 'year', 'title', 'denomination', 'faceCurrency', 'catalogue', 'color', null]);
  assert.deepEqual(m.unmatched, ['Paper']);
  const g = mapHeaders(['Land', 'Jahr', 'Michel', 'Erhaltung', 'Notiz', 'Menge']);
  assert.deepEqual(g.fields, ['country', 'year', 'michel', 'condition', 'notes', 'quantity']);
});

test('catalogue numbers and gum words are understood', () => {
  assert.deepEqual(parseCatalogue('Scott 15; SG 31 (unsure)'), [
    { system: 'Scott', number: '15', certainty: 'likely' },
    { system: 'Stanley Gibbons', number: '31', certainty: 'unsure' }
  ]);
  assert.deepEqual(parseCatalogue('Sc# 4, Mi 12a'), [
    { system: 'Scott', number: '4', certainty: 'likely' },
    { system: 'Michel', number: '12a', certainty: 'likely' }
  ]);
  assert.deepEqual(parseCatalogue('86', 'Unitrade'), [{ system: 'Unitrade', number: '86', certainty: 'likely' }]);
  assert.equal(normGum('**'), 'Mint never hinged');
  assert.equal(normGum('*'), 'Mint hinged');
  assert.equal(normGum('(*)'), 'Unused, no gum');
  assert.equal(normGum('o'), 'Used');
  assert.equal(normGum('postfrisch'), 'Mint never hinged');
  assert.equal(normGum('MNH'), 'Mint never hinged');
  assert.equal(normGum('used'), 'Used');
  assert.equal(normGum(''), '');
});

test('a spreadsheet row becomes a record, and nothing in it is lost', () => {
  const text = [
    'Country,Year,Denomination,Design,Scott #,Condition,Catalog Value,Album,Page,Paper,Purchase Price,Status',
    'Canada,1859,5c,Beaver,15,used,40,3,12,Wove,"$12.50",For sale'
  ].join('\n');
  const L = readList(text);
  const r = rowToStamp(L.rows[0], L.map, L.headers, { cur: 'CAD', statuses: STATUSES, file: 'list.csv', index: 0, now: '2026-10-17T00:00:00Z' });
  assert.equal(r.record.title, 'Canada 1859 5c Beaver');
  assert.deepEqual(r.record.catalogue, [{ system: 'Scott', number: '15', certainty: 'likely' }]);
  assert.equal(r.record.gum, 'Used');
  assert.equal(r.record.pricing.catalogue.amount, 40);
  assert.equal(r.record.location, 'Album 3, page 12');
  assert.equal(r.status, 'sell');
  assert.deepEqual(r.priv, { paid: '$12.50' });
  assert.match(r.notes, /Paper: Wove/);
  assert.equal(r.record.imported.row, 2);
});

test('a Colnect-style export with title lines and item links imports', () => {
  const text = [
    'My Colnect collection', '', 'Exported 2026-10-01',
    'Name,Country,Series,Issued on,FaceValue,Currency,Catalog Codes,Link',
    'Beaver,Canada,Pence issue,1851-04-23,3,Pence,"Sc:CA 1, SG:CA 1",https://colnect.com/en/stamps/stamp/12345-Beaver'
  ].join('\n');
  const L = readList(text);
  assert.equal(L.headers[0], 'Name');
  const r = rowToStamp(L.rows[0], L.map, L.headers, { cur: 'CAD', statuses: STATUSES, index: 0 });
  assert.equal(r.record.title, 'Beaver');
  assert.equal(r.record.denomination, '3 Pence');
  assert.equal(r.record.issue, 'Pence issue');
  assert.equal(r.record.year, '1851-04-23');
  assert.equal(r.record.catalogue.length, 2);
  assert.match(r.notes, /Colnect: https:\/\/colnect\.com\/en\/stamps\/stamp\/12345-Beaver/);
});

test('a Stamp Loupe export reads back in', () => {
  const list = [{ id: 'a', title: 'Great Britain 1840 1d black', country: 'Great Britain', year: '1840', denomination: '1d', color: 'Black',
    catalogue: [{ system: 'Stanley Gibbons', number: '2', certainty: 'likely' }], condition: { state: 'Used', grade: 'Fine' },
    value: { currency: 'CAD', low: 100, high: 300 }, status: 'keep', notes: '=risky formula', addedAt: '2026-01-01' }];
  const csv = collectionCSV(list, { statusLabel: id => (STATUSES.find(s => s.id === id) || STATUSES[0]).label, planning: () => ({ amount: 200, label: 'AI estimate' }) });
  const L = readList(csv);
  const r = rowToStamp(L.rows[0], L.map, L.headers, { cur: 'CAD', statuses: STATUSES, index: 0 });
  assert.equal(r.record.title, 'Great Britain 1840 1d black');
  assert.equal(r.record.value.low, 100);
  assert.equal(r.record.value.high, 300);
  assert.equal(r.record.catalogue[0].system, 'Stanley Gibbons');
  assert.equal(r.notes, '=risky formula', 'the export guard is undone');
  assert.equal(r.status, 'keep');
});
