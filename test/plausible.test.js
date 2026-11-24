import { test } from 'node:test';
import assert from 'node:assert/strict';
import { implausible, unitKey, numberOf } from '../public/plausible.js';

test('a value read from the next row is caught', () => {
  assert.equal(implausible('hemoglobin', '47,3', 'g/dL'), true);
  assert.equal(implausible('hemoglobin', '41,0', 'g/dL'), true);
  assert.equal(implausible('hematocrit', '4,6', '%'), true);
  assert.equal(implausible('wbc', '242', '10^3/µL'), false); // possible, if extreme
  assert.equal(implausible('rbc', '5,8', '10^6/µl'), false);
});

test('a whole row shifted up, unit and range with it, is caught', () => {
  // the 2026-03-02 photo: every test got the next row's value, unit and range
  assert.equal(implausible('hemoglobin', '47,3', '%', '40 - 52'), true);
  assert.equal(implausible('hematocrit', '4,6', '10^6/µL', '4.5 - 5.9'), true);
  assert.equal(implausible('rbc', '5,8', '10^3/µL', '4.0 - 10.0'), true);
  assert.equal(implausible('wbc', '242', '10^3/µL', '150 - 400'), true);
  // and a right row is left alone
  assert.equal(implausible('hemoglobin', '15,6', 'g/dL', '13.5 - 17.5'), false);
  assert.equal(implausible('wbc', '5,8', '10^3/µL', '4.0 - 10.0'), false);
  assert.equal(implausible('hba1c', '5,3', '%', '4.0 - 5.6'), false);
});

test('real results, other units and unknown analytes are never flagged', () => {
  assert.equal(implausible('hemoglobin', '15,1', 'g/dL'), false);
  assert.equal(implausible('hemoglobin', '151', 'g/L'), false);
  assert.equal(implausible('hemoglobin', '47', 'mystery'), false);
  assert.equal(implausible(null, '9999', 'g/dL'), false);
  assert.equal(implausible('glucose', '< 20', 'mg/dL'), false);
  assert.equal(implausible('glucose', 'negativo', 'mg/dL'), false);
});

test('units are compared the way labs write them', () => {
  assert.equal(unitKey('10^3/uL'), '10^3/µl');
  assert.equal(unitKey('x10^9/L'), '10^9/l');
  assert.equal(unitKey('10³/μl'.replace('³', '3')), '10^3/µl');
  assert.equal(numberOf("1'250"), 1250);
  assert.equal(numberOf('5,4'), 5.4);
});
