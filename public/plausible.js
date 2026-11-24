// Values no living patient has (v1): a haemoglobin of 47 g/dL is the
// haematocrit read into the wrong row, not a result. Only the analytes and
// units listed are checked; anything else is never flagged. The bounds are
// deliberately wide: this catches misreadings, it does not judge results.

const BOUNDS = {
  hemoglobin: { 'g/dl': [2, 25], 'g/l': [20, 250], 'mmol/l': [1, 16] },
  hematocrit: { '%': [8, 75] },
  rbc: { '10^6/µl': [0.5, 9], '10^12/l': [0.5, 9] },
  wbc: { '10^3/µl': [0.1, 300], '10^9/l': [0.1, 300] },
  platelets: { '10^3/µl': [2, 2500], '10^9/l': [2, 2500] },
  mcv: { fl: [40, 150] },
  glucose: { 'mg/dl': [10, 1500], 'mmol/l': [0.5, 85] },
  hba1c: { '%': [2.5, 20], 'mmol/mol': [5, 200] },
  cholesterol_total: { 'mg/dl': [40, 1000], 'mmol/l': [1, 26] },
  hdl: { 'mg/dl': [5, 200], 'mmol/l': [0.1, 5.2] },
  ldl: { 'mg/dl': [5, 800], 'mmol/l': [0.1, 21] },
  triglycerides: { 'mg/dl': [10, 10000], 'mmol/l': [0.1, 115] },
  creatinine: { 'mg/dl': [0.05, 25], 'µmol/l': [4, 2200] },
  sodium: { 'mmol/l': [95, 185], 'meq/l': [95, 185] },
  potassium: { 'mmol/l': [1, 10], 'meq/l': [1, 10] },
  weight: { kg: [0.3, 400] },
  height: { cm: [20, 260] },
  bp_systolic: { mmhg: [40, 300] },
  bp_diastolic: { mmhg: [20, 200] },
  heart_rate: { bpm: [15, 300], '/min': [15, 300] },
};

export function unitKey(unit) {
  return String(unit ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[μu](?=[lm])/g, 'µ')
    .replace(/×|x(?=10)/g, '')
    .replace(/\*\*/g, '^')
    .replace(/^10(\d)/, '10^$1')
    .replace(/mm3$/, 'µl');
}

export function numberOf(value) {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(value ?? '').replace(/(\d)['’ ](?=\d{3}\b)/g, '$1'));
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** True when the value cannot be a real result for that analyte in that unit. */
export function implausible(analyte, value, unit) {
  const b = BOUNDS[analyte]?.[unitKey(unit)];
  const n = numberOf(value);
  return !!b && n != null && (n < b[0] || n > b[1]);
}
