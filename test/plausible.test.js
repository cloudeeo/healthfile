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
