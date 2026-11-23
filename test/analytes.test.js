import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyteOf, parseNumber, parseReference, flagOf, toMeasurement, normalise } from '../src/analytes.js';

test('analyteOf: Italian, French and English names map to one analyte; unknown stays null', () => {
  assert.equal(analyteOf('Colesterolo HDL'), 'hdl');
  assert.equal(analyteOf('Cholestérol HDL'), 'hdl');
  assert.equal(analyteOf('HDL cholesterol'), 'hdl');
  assert.equal(analyteOf('Emoglobina glicata (HbA1c)'), 'hba1c');
  assert.equal(analyteOf('ALT (GPT)'), 'alt');
  assert.equal(analyteOf('Vitamina D (25-OH)'), 'vitamin_d');
  assert.equal(analyteOf('Gamma GT'), 'ggt');
  assert.equal(analyteOf('Fer sérique'), 'iron');
  assert.equal(analyteOf('Colesterolo HDL metodo diretto'), 'hdl', 'trailing words are dropped');
  assert.equal(analyteOf('Antigene misterioso'), null);
  assert.equal(normalise('  Émoglobina  '), 'emoglobina');
});

test('parseNumber and parseReference read what labs print', () => {
  assert.equal(parseNumber('5,4'), 5.4);
  // a flag printed next to the number (seen on omen01: "27 *")
  assert.equal(parseNumber('27 *'), 27);
  assert.equal(parseNumber('8.1 H'), 8.1);
  assert.equal(parseNumber('3,2↑'), 3.2);
  assert.equal(parseNumber('-3'), -3);
  assert.equal(analyteOf('Piastre')?.id ?? analyteOf('Piastre'), analyteOf('Piastrine')?.id ?? analyteOf('Piastrine'));
  assert.equal(parseNumber('< 0.5'), 0.5);
  assert.equal(parseNumber('negativo'), null);
  assert.equal(parseNumber(12), 12);
  assert.deepEqual(parseReference('3.5 - 5.1'), { low: 3.5, high: 5.1 });
  assert.deepEqual(parseReference('3,5–5,1'), { low: 3.5, high: 5.1 });
  assert.deepEqual(parseReference('< 200'), { low: null, high: 200 });
  assert.deepEqual(parseReference('> 40'), { low: 40, high: null });
  assert.deepEqual(parseReference('vedi nota'), { low: null, high: null });
});

test('flagOf: printed flag wins, otherwise the range decides', () => {
  assert.equal(flagOf(215, null, 200, null), 'H');
  assert.equal(flagOf(24, 30, 100, null), 'L');
  assert.equal(flagOf(50, 30, 100, null), null);
  assert.equal(flagOf(50, 30, 100, '*'), 'H');
  assert.equal(flagOf(50, 30, 100, 'basso'), 'L');
  assert.equal(flagOf(null, 30, 100, null), null);
});

test('toMeasurement: a reader row becomes a normalised measurement', () => {
  const m = toMeasurement({ name: 'Trigliceridi', value: '164', unit: 'mg/dL', reference: '< 150', flag: null }, 1);
  assert.deepEqual(m, { page: 1, name: 'Trigliceridi', analyte: 'triglycerides', value: '164', number: 164, unit: 'mg/dL', reference: '< 150', refLow: null, refHigh: 150, flag: 'H' });
  assert.equal(toMeasurement({ name: '  ' }), null);
});
