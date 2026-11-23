// Common lab analytes with the names they carry on Italian, French and
// English reports, so values from different labs line up in one series.
// Unknown names are kept as printed, with analyte = null.

const TABLE = [
  ['hemoglobin', 'Hemoglobin', ['emoglobina', 'hb', 'hgb', 'hémoglobine', 'hemoglobine', 'hemoglobin']],
  ['hematocrit', 'Hematocrit', ['ematocrito', 'hct', 'ht', 'hématocrite', 'hematocrite', 'hematocrit']],
  ['rbc', 'Red blood cells', ['eritrociti', 'globuli rossi', 'rbc', 'gr', 'érythrocytes', 'erythrocytes', 'hématies', 'hematies', 'red blood cells']],
  ['wbc', 'White blood cells', ['leucociti', 'globuli bianchi', 'wbc', 'gb', 'leucocytes', 'white blood cells']],
  ['platelets', 'Platelets', ['piastrine', 'piastre', 'plt', 'plaquettes', 'thrombocytes', 'platelets']],
  ['mcv', 'MCV', ['mcv', 'vcm', 'volume corpuscolare medio', 'vgm']],
  ['mch', 'MCH', ['mch', 'hcm', 'tcmh']],
  ['mchc', 'MCHC', ['mchc', 'chcm', 'ccmh']],
  ['neutrophils', 'Neutrophils', ['neutrofili', 'neutrophiles', 'neutrophils']],
  ['lymphocytes', 'Lymphocytes', ['linfociti', 'lymphocytes']],
  ['monocytes', 'Monocytes', ['monociti', 'monocytes']],
  ['eosinophils', 'Eosinophils', ['eosinofili', 'éosinophiles', 'eosinophiles', 'eosinophils']],
  ['basophils', 'Basophils', ['basofili', 'basophiles', 'basophils']],
  ['glucose', 'Glucose', ['glicemia', 'glucosio', 'glucose', 'glycémie', 'glycemie', 'blood glucose']],
  ['hba1c', 'HbA1c', ['emoglobina glicata', 'hba1c', 'hémoglobine glyquée', 'hemoglobine glyquee', 'glycated hemoglobin', 'a1c']],
  ['cholesterol_total', 'Total cholesterol', ['colesterolo totale', 'colesterolo', 'cholestérol total', 'cholesterol total', 'total cholesterol', 'cholesterol']],
  ['hdl', 'HDL cholesterol', ['colesterolo hdl', 'hdl', 'hdl-c', 'cholestérol hdl', 'hdl cholesterol']],
  ['ldl', 'LDL cholesterol', ['colesterolo ldl', 'ldl', 'ldl-c', 'cholestérol ldl', 'ldl cholesterol']],
  ['triglycerides', 'Triglycerides', ['trigliceridi', 'triglycérides', 'triglycerides']],
  ['creatinine', 'Creatinine', ['creatinina', 'créatinine', 'creatinine']],
  ['egfr', 'eGFR', ['egfr', 'gfr', 'velocità di filtrazione glomerulare', 'dfg', 'filtrato glomerulare']],
  ['urea', 'Urea', ['urea', 'azotemia', 'urée', 'uree', 'bun']],
  ['uric_acid', 'Uric acid', ['acido urico', 'uricemia', 'acide urique', 'uric acid']],
  ['sodium', 'Sodium', ['sodio', 'na', 'sodium']],
  ['potassium', 'Potassium', ['potassio', 'k', 'potassium']],
  ['calcium', 'Calcium', ['calcio', 'ca', 'calcium']],
  ['magnesium', 'Magnesium', ['magnesio', 'mg', 'magnésium', 'magnesium']],
  ['iron', 'Iron', ['ferro', 'sideremia', 'fer', 'fer sérique', 'iron', 'serum iron']],
  ['ferritin', 'Ferritin', ['ferritina', 'ferritine', 'ferritin']],
  ['transferrin', 'Transferrin', ['transferrina', 'transferrine', 'transferrin']],
  ['vitamin_d', 'Vitamin D', ['vitamina d', '25-oh vitamina d', '25 oh vitamina d', 'vitamine d', '25-oh-d', 'vitamin d', '25-hydroxyvitamin d']],
  ['vitamin_b12', 'Vitamin B12', ['vitamina b12', 'b12', 'cobalamina', 'vitamine b12', 'vitamin b12']],
  ['folate', 'Folate', ['folati', 'acido folico', 'folates', 'acide folique', 'folate', 'folic acid']],
  ['tsh', 'TSH', ['tsh', 'tireotropina', 'thyréostimuline', 'thyrotropin']],
  ['ft4', 'Free T4', ['ft4', 't4 libera', 't4 libre', 'free t4', 'tiroxina libera']],
  ['ft3', 'Free T3', ['ft3', 't3 libera', 't3 libre', 'free t3']],
  ['alt', 'ALT', ['alt', 'gpt', 'alat', 'alanina aminotransferasi', 'sgpt', 'alanine aminotransferase']],
  ['ast', 'AST', ['ast', 'got', 'asat', 'aspartato aminotransferasi', 'sgot', 'aspartate aminotransferase']],
  ['ggt', 'GGT', ['ggt', 'gamma gt', 'gamma-gt', 'γ-gt', 'gamma glutamil transferasi', 'gamma-glutamyl transferase']],
  ['alp', 'Alkaline phosphatase', ['fosfatasi alcalina', 'alp', 'pal', 'phosphatase alcaline', 'alkaline phosphatase']],
  ['bilirubin_total', 'Total bilirubin', ['bilirubina totale', 'bilirubina', 'bilirubine totale', 'total bilirubin', 'bilirubin']],
  ['albumin', 'Albumin', ['albumina', 'albumine', 'albumin']],
  ['total_protein', 'Total protein', ['proteine totali', 'protidemia', 'protéines totales', 'proteines totales', 'total protein']],
  ['crp', 'CRP', ['pcr', 'proteina c reattiva', 'crp', 'protéine c réactive', 'proteine c reactive', 'c-reactive protein', 'hs-crp']],
  ['esr', 'ESR', ['ves', 'velocità di eritrosedimentazione', 'vs', 'vitesse de sédimentation', 'esr', 'sed rate']],
  ['psa', 'PSA', ['psa', 'psa totale', 'antigene prostatico specifico', 'psa total']],
  ['inr', 'INR', ['inr']],
  ['pt', 'Prothrombin time', ['pt', 'tempo di protrombina', 'tp', 'taux de prothrombine', 'prothrombin time']],
  ['aptt', 'aPTT', ['aptt', 'ptt', 'tempo di tromboplastina parziale', 'tca']],
  ['d_dimer', 'D-dimer', ['d-dimero', 'd dimero', 'd-dimères', 'd-dimer']],
  ['insulin', 'Insulin', ['insulina', 'insuline', 'insulin']],
  ['cortisol', 'Cortisol', ['cortisolo', 'cortisol']],
  ['testosterone', 'Testosterone', ['testosterone', 'testostérone']],
  ['estradiol', 'Estradiol', ['estradiolo', 'oestradiol', 'estradiol', 'e2']],
  ['ldh', 'LDH', ['ldh', 'lattato deidrogenasi', 'lactate dehydrogenase']],
  ['ck', 'CK', ['ck', 'cpk', 'creatinchinasi', 'créatine kinase', 'creatine kinase']],
  ['lipase', 'Lipase', ['lipasi', 'lipase']],
  ['amylase', 'Amylase', ['amilasi', 'amylase']],
  ['troponin', 'Troponin', ['troponina', 'troponine', 'troponin', 'hs-troponin']],
  ['bnp', 'NT-proBNP', ['nt-probnp', 'bnp', 'probnp']],
  ['weight', 'Weight', ['peso', 'poids', 'weight']],
  ['height', 'Height', ['altezza', 'statura', 'taille', 'height']],
  ['bmi', 'BMI', ['bmi', 'imc', 'indice di massa corporea']],
  ['bp_systolic', 'Systolic blood pressure', ['pressione sistolica', 'pas', 'systolic', 'pressione massima', 'pression systolique']],
  ['bp_diastolic', 'Diastolic blood pressure', ['pressione diastolica', 'pad', 'diastolic', 'pressione minima', 'pression diastolique']],
  ['heart_rate', 'Heart rate', ['frequenza cardiaca', 'fc', 'polso', 'pouls', 'heart rate', 'pulse']],
];

const BY_ALIAS = new Map();
const LABELS = new Map();
for (const [id, label, aliases] of TABLE) {
  LABELS.set(id, label);
  for (const a of aliases) BY_ALIAS.set(normalise(a), id);
}

export const ANALYTES = TABLE.map(([id, label]) => ({ id, label }));
export const analyteLabel = (id) => LABELS.get(id) ?? id;

export function normalise(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9%+.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The canonical analyte for a printed name, or null. */
export function analyteOf(name) {
  const n = normalise(name);
  if (!n) return null;
  if (BY_ALIAS.has(n)) return BY_ALIAS.get(n);
  // "Colesterolo HDL (metodo diretto)" → try without trailing words
  const words = n.split(' ');
  for (let len = words.length - 1; len >= 1; len--) {
    const head = words.slice(0, len).join(' ');
    if (BY_ALIAS.has(head)) return BY_ALIAS.get(head);
  }
  return null;
}

/** "5,4" → 5.4; "< 0.5" → 0.5 (with the sign kept in `value`); "negativo" → null. */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // a flag printed next to the number ("27 *", "8.1 H", "3,2↑") is not part of it
  const s = String(value ?? '').trim().replace(/\s*(\*+|[HL]|↑|↓|\(?[+-]\)?)$/u, '').replace(/\s+/g, '');
  const m = /^[<>≤≥]?\s*([-+]?\d+(?:[.,]\d+)?)$/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(',', '.'));
}

/** "3.5 - 5.1", "3,5–5,1", "< 200", "> 40", "≤ 5" → [low, high] (null when open). */
export function parseReference(ref) {
  if (ref == null) return { low: null, high: null };
  const s = String(ref).replace(/\s+/g, '').replace(/,/g, '.');
  let m = /^([-+]?\d+(?:\.\d+)?)[-–—]([-+]?\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  m = /^[<≤]([-+]?\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { low: null, high: Number(m[1]) };
  m = /^[>≥]([-+]?\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { low: Number(m[1]), high: null };
  return { low: null, high: null };
}

/** Flag from the value and the range when the lab printed none: "H", "L" or null. */
export function flagOf(number, low, high, printed) {
  const p = String(printed ?? '').trim().toUpperCase();
  if (p) return /^(H|HH|\*|↑|ALTO|HIGH|HAUT|\+)$/.test(p) ? 'H' : /^(L|LL|↓|BASSO|LOW|BAS|-)$/.test(p) ? 'L' : p.slice(0, 2);
  if (number == null) return null;
  if (high != null && number > high) return 'H';
  if (low != null && number < low) return 'L';
  return null;
}

/** A row as the reader returned it → a measurement row for the store. */
export function toMeasurement(v, page = null) {
  const name = String(v?.name ?? '').trim();
  if (!name) return null;
  const number = parseNumber(v.value);
  const { low, high } = parseReference(v.reference);
  return {
    page,
    name,
    analyte: analyteOf(name),
    value: v.value == null ? null : String(v.value).trim(),
    number,
    unit: v.unit == null ? null : String(v.unit).trim() || null,
    reference: v.reference == null ? null : String(v.reference).trim() || null,
    refLow: low,
    refHigh: high,
    flag: flagOf(number, low, high, v.flag),
  };
}
