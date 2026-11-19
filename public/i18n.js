// Interface strings in Italian, French and English. Same contract as the
// dashboard's module: t(key, params), `{name}` placeholders, `{ one, other }`
// entries chosen by params.n, data-i18n attributes filled by applyDom().

export const UI_LANGS = ['it', 'fr', 'en'];
export const LANG_NAMES = { it: 'Italiano', fr: 'Français', en: 'English' };
export const LOCALES = { it: 'it-IT', fr: 'fr-CH', en: 'en-GB' };
export const LANG_KEY = 'healthfile-lang';
export const DEFAULT_LANG = 'it';

export const dictionaries = {
  it: {
    'app.name': 'HealthFile',
    'app.tagline': 'I documenti sanitari della famiglia, letti e archiviati in casa.',
    'hero.title': 'La salute della famiglia, in ordine. A casa.',
    'hero.lead': 'Fotografa un referto, una ricetta o una fattura: HealthFile lo legge, lo archivia sotto la persona giusta e tiene traccia dei valori nel tempo. Tutto gira su questo server, nulla esce di casa.',
    'hero.cta': 'Aggiungi un documento',
    'hero.review': { one: '1 documento da controllare', other: '{n} documenti da controllare' },
    'hero.stat.docs': 'documenti',
    'hero.stat.people': 'persone',
    'hero.stat.values': 'valori',
    'hero.step1': 'Fotografa',
    'hero.step1d': 'Referti, lettere, ricette, fatture, polizze.',
    'hero.step2': 'Controlla',
    'hero.step2d': 'Il lettore propone, tu confermi o correggi.',
    'hero.step3': 'Ritrova',
    'hero.step3d': 'Timeline per persona e valori nel tempo.',
    'nav.home': 'Archivio',
    'nav.add': 'Aggiungi',
    'nav.review': 'Da controllare',
    'nav.language': 'Lingua',
    'theme.label': 'Tema: {theme}',
    'theme.auto': 'auto',
    'theme.light': 'chiaro',
    'theme.dark': 'scuro',
    'common.cancel': 'Annulla',
    'common.save': 'Salva',
    'common.delete': 'Elimina',
    'common.close': 'Chiudi',
    'common.back': 'Indietro',
    'common.loading': 'Caricamento…',
    'common.none': 'nessuno',
    'common.unknown': 'sconosciuto',
    'common.page': 'pagina {n}',
    'common.pages': { one: '1 pagina', other: '{n} pagine' },
    'common.values': { one: '1 valore', other: '{n} valori' },
    'common.confirmDelete': 'Eliminare davvero? Il file e i dati estratti vengono cancellati.',
    'common.confirmDeleteAgain': 'Ultima conferma: eliminare {title}?',

    'status.private': 'Tutto resta in casa: 0 chiamate verso internet.',
    'status.mock': 'Modalità di prova: famiglia e documenti sono inventati.',
    'status.readerDown': 'Il lettore ({model}) non è disponibile: i nuovi documenti restano in attesa.',
    'status.qvacDown': 'qvac serve non risponde: {why}',

    'people.title': 'Persone',
    'people.add': 'Aggiungi una persona',
    'people.name': 'Nome e cognome',
    'people.born': 'Data di nascita',
    'people.all': 'Tutta la famiglia',
    'people.docs': { one: '1 documento', other: '{n} documenti' },
    'people.empty': 'Nessuna persona ancora. Aggiungi i membri della famiglia per archiviare i documenti sotto il nome giusto.',
    'people.unassigned': 'Senza persona',

    'add.title': 'Aggiungi un documento',
    'add.camera': 'Fotografa',
    'add.file': 'Scegli un file',
    'add.hint': 'PDF o foto (JPEG, PNG, WebP). Una foto per pagina, oppure un PDF con tutte le pagine.',
    'add.person': 'Di chi è',
    'add.personAuto': 'Lo decide il lettore dal nome stampato',
    'add.uploading': 'Invio in corso…',
    'add.queued': 'In lettura: {name}',
    'add.failed': 'Non è stato possibile inviare {name}: {why}',
    'add.done': 'Letto: {name}. Ora va controllato.',

    'review.title': 'Da controllare',
    'review.empty': 'Niente da controllare.',
    'review.reading': 'Il lettore sta leggendo…',
    'review.readingPages': 'Lettura in corso, {n} pagine',
    'review.failed': 'Lettura fallita: {why}',
    'review.retry': 'Riprova la lettura',
    'review.intro': 'Controlla quello che il lettore ha capito e correggi se serve. Niente viene archiviato prima della tua conferma.',
    'review.confirm': 'Conferma e archivia',
    'review.confirmed': 'Archiviato.',
    'review.kind': 'Tipo',
    'review.date': 'Data',
    'review.person': 'Persona',
    'review.title.field': 'Titolo',
    'review.issuer': 'Emesso da',
    'review.values': 'Valori',
    'review.valuesHint': 'Ogni riga è un valore letto dalla pagina. Correggi quello che non corrisponde, togli le righe sbagliate.',
    'review.addValue': 'Aggiungi un valore',
    'review.removeValue': 'Togli',
    'review.col.name': 'Esame',
    'review.col.value': 'Valore',
    'review.col.unit': 'Unità',
    'review.col.ref': 'Riferimento',
    'review.col.flag': 'Segn.',
    'review.text': 'Testo letto',
    'review.medications': 'Farmaci',
    'review.followUps': 'Controlli previsti',
    'review.amount': 'Importo',
    'review.personHint': 'Nome stampato: {name}',
    'review.edited': 'Modificato a mano: {fields}',
    'review.readIn': 'Letto da {model} in {s} s',

    'kind.lab_report': 'Esami di laboratorio',
    'kind.letter': 'Lettera / referto di visita',
    'kind.prescription': 'Ricetta',
    'kind.vaccination': 'Vaccinazioni',
    'kind.imaging_report': 'Referto radiologico',
    'kind.discharge': 'Lettera di dimissione',
    'kind.invoice': 'Fattura',
    'kind.insurance': 'Assicurazione',
    'kind.other': 'Altro',

    'timeline.title': 'Documenti',
    'timeline.empty': 'Nessun documento ancora.',
    'timeline.filter': 'Filtra per tipo',
    'timeline.allKinds': 'Tutti i tipi',
    'timeline.undated': 'senza data',
    'timeline.state.reading': 'in lettura',
    'timeline.state.review': 'da controllare',
    'timeline.state.failed': 'lettura fallita',

    'values.title': 'Valori nel tempo',
    'values.empty': 'Nessun valore numerico archiviato per questa persona.',
    'values.latest': 'ultimo',
    'values.points': { one: '1 misura', other: '{n} misure' },
    'values.range': 'riferimento {range}',
    'values.high': 'alto',
    'values.low': 'basso',
    'values.chartTitle': '{name}, {n} misure',
    'values.refBand': 'intervallo di riferimento',

    'doc.original': 'Apri l’originale',
    'doc.reread': 'Rileggi',
    'doc.edit': 'Modifica',
    'doc.filedOn': 'Archiviato il {date}',
    'doc.flag.H': 'alto',
    'doc.flag.L': 'basso',

    'footer.scope': 'HealthFile legge, archivia e ritrova i documenti della famiglia. Non fa diagnosi: per ogni decisione c’è il medico.',
  },

  fr: {
    'app.name': 'HealthFile',
    'app.tagline': 'Les documents de santé de la famille, lus et classés à la maison.',
    'hero.title': 'La santé de la famille, en ordre. À la maison.',
    'hero.lead': 'Photographiez un rapport, une ordonnance ou une facture : HealthFile le lit, le classe sous la bonne personne et suit les valeurs dans le temps. Tout tourne sur ce serveur, rien ne sort de la maison.',
    'hero.cta': 'Ajouter un document',
    'hero.review': { one: '1 document à vérifier', other: '{n} documents à vérifier' },
    'hero.stat.docs': 'documents',
    'hero.stat.people': 'personnes',
    'hero.stat.values': 'valeurs',
    'hero.step1': 'Photographier',
    'hero.step1d': 'Rapports, lettres, ordonnances, factures, polices.',
    'hero.step2': 'Vérifier',
    'hero.step2d': 'Le lecteur propose, vous confirmez ou corrigez.',
    'hero.step3': 'Retrouver',
    'hero.step3d': 'Chronologie par personne et valeurs dans le temps.',
    'nav.home': 'Dossier',
    'nav.add': 'Ajouter',
    'nav.review': 'À vérifier',
    'nav.language': 'Langue',
    'theme.label': 'Thème : {theme}',
    'theme.auto': 'auto',
    'theme.light': 'clair',
    'theme.dark': 'sombre',
    'common.cancel': 'Annuler',
    'common.save': 'Enregistrer',
    'common.delete': 'Supprimer',
    'common.close': 'Fermer',
    'common.back': 'Retour',
    'common.loading': 'Chargement…',
    'common.none': 'aucun',
    'common.unknown': 'inconnu',
    'common.page': 'page {n}',
    'common.pages': { one: '1 page', other: '{n} pages' },
    'common.values': { one: '1 valeur', other: '{n} valeurs' },
    'common.confirmDelete': 'Vraiment supprimer ? Le fichier et les données extraites seront effacés.',
    'common.confirmDeleteAgain': 'Dernière confirmation : supprimer {title} ?',

    'status.private': 'Tout reste à la maison : 0 appel vers internet.',
    'status.mock': 'Mode démo : la famille et les documents sont inventés.',
    'status.readerDown': 'Le lecteur ({model}) n’est pas disponible : les nouveaux documents attendent.',
    'status.qvacDown': 'qvac serve ne répond pas : {why}',

    'people.title': 'Personnes',
    'people.add': 'Ajouter une personne',
    'people.name': 'Prénom et nom',
    'people.born': 'Date de naissance',
    'people.all': 'Toute la famille',
    'people.docs': { one: '1 document', other: '{n} documents' },
    'people.empty': 'Personne pour l’instant. Ajoutez les membres de la famille pour classer les documents sous le bon nom.',
    'people.unassigned': 'Sans personne',

    'add.title': 'Ajouter un document',
    'add.camera': 'Photographier',
    'add.file': 'Choisir un fichier',
    'add.hint': 'PDF ou photo (JPEG, PNG, WebP). Une photo par page, ou un PDF avec toutes les pages.',
    'add.person': 'À qui il appartient',
    'add.personAuto': 'Le lecteur décide d’après le nom imprimé',
    'add.uploading': 'Envoi en cours…',
    'add.queued': 'En lecture : {name}',
    'add.failed': 'Impossible d’envoyer {name} : {why}',
    'add.done': 'Lu : {name}. À vérifier maintenant.',

    'review.title': 'À vérifier',
    'review.empty': 'Rien à vérifier.',
    'review.reading': 'Le lecteur lit…',
    'review.readingPages': 'Lecture en cours, {n} pages',
    'review.failed': 'Lecture échouée : {why}',
    'review.retry': 'Relancer la lecture',
    'review.intro': 'Vérifiez ce que le lecteur a compris et corrigez si besoin. Rien n’est classé avant votre confirmation.',
    'review.confirm': 'Confirmer et classer',
    'review.confirmed': 'Classé.',
    'review.kind': 'Type',
    'review.date': 'Date',
    'review.person': 'Personne',
    'review.title.field': 'Titre',
    'review.issuer': 'Émis par',
    'review.values': 'Valeurs',
    'review.valuesHint': 'Chaque ligne est une valeur lue sur la page. Corrigez ce qui ne correspond pas, retirez les lignes fausses.',
    'review.addValue': 'Ajouter une valeur',
    'review.removeValue': 'Retirer',
    'review.col.name': 'Analyse',
    'review.col.value': 'Valeur',
    'review.col.unit': 'Unité',
    'review.col.ref': 'Référence',
    'review.col.flag': 'Sign.',
    'review.text': 'Texte lu',
    'review.medications': 'Médicaments',
    'review.followUps': 'Contrôles prévus',
    'review.amount': 'Montant',
    'review.personHint': 'Nom imprimé : {name}',
    'review.edited': 'Modifié à la main : {fields}',
    'review.readIn': 'Lu par {model} en {s} s',

    'kind.lab_report': 'Analyses de laboratoire',
    'kind.letter': 'Lettre / rapport de consultation',
    'kind.prescription': 'Ordonnance',
    'kind.vaccination': 'Vaccinations',
    'kind.imaging_report': 'Rapport de radiologie',
    'kind.discharge': 'Lettre de sortie',
    'kind.invoice': 'Facture',
    'kind.insurance': 'Assurance',
    'kind.other': 'Autre',

    'timeline.title': 'Documents',
    'timeline.empty': 'Aucun document pour l’instant.',
    'timeline.filter': 'Filtrer par type',
    'timeline.allKinds': 'Tous les types',
    'timeline.undated': 'sans date',
    'timeline.state.reading': 'en lecture',
    'timeline.state.review': 'à vérifier',
    'timeline.state.failed': 'lecture échouée',

    'values.title': 'Valeurs dans le temps',
    'values.empty': 'Aucune valeur numérique classée pour cette personne.',
    'values.latest': 'dernière',
    'values.points': { one: '1 mesure', other: '{n} mesures' },
    'values.range': 'référence {range}',
    'values.high': 'haut',
    'values.low': 'bas',
    'values.chartTitle': '{name}, {n} mesures',
    'values.refBand': 'intervalle de référence',

    'doc.original': 'Ouvrir l’original',
    'doc.reread': 'Relire',
    'doc.edit': 'Modifier',
    'doc.filedOn': 'Classé le {date}',
    'doc.flag.H': 'haut',
    'doc.flag.L': 'bas',

    'footer.scope': 'HealthFile lit, classe et retrouve les documents de la famille. Il ne pose pas de diagnostic : pour chaque décision, il y a le médecin.',
  },

  en: {
    'app.name': 'HealthFile',
    'app.tagline': "The family's health records, read and filed at home.",
    'hero.title': "The family's health, in order. At home.",
    'hero.lead': 'Photograph a report, a prescription or an invoice: HealthFile reads it, files it under the right person and tracks the values over time. Everything runs on this server; nothing leaves the house.',
    'hero.cta': 'Add a document',
    'hero.review': { one: '1 document to review', other: '{n} documents to review' },
    'hero.stat.docs': 'documents',
    'hero.stat.people': 'people',
    'hero.stat.values': 'values',
    'hero.step1': 'Photograph',
    'hero.step1d': 'Reports, letters, prescriptions, invoices, policies.',
    'hero.step2': 'Review',
    'hero.step2d': 'The reader proposes, you confirm or correct.',
    'hero.step3': 'Find',
    'hero.step3d': 'A timeline per person and values over time.',
    'nav.home': 'File',
    'nav.add': 'Add',
    'nav.review': 'To review',
    'nav.language': 'Language',
    'theme.label': 'Theme: {theme}',
    'theme.auto': 'auto',
    'theme.light': 'light',
    'theme.dark': 'dark',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.loading': 'Loading…',
    'common.none': 'none',
    'common.unknown': 'unknown',
    'common.page': 'page {n}',
    'common.pages': { one: '1 page', other: '{n} pages' },
    'common.values': { one: '1 value', other: '{n} values' },
    'common.confirmDelete': 'Really delete? The file and the extracted data are erased.',
    'common.confirmDeleteAgain': 'Last confirmation: delete {title}?',

    'status.private': 'Everything stays at home: 0 calls to the internet.',
    'status.mock': 'Demo mode: the family and the documents are invented.',
    'status.readerDown': 'The reader ({model}) is not available: new documents wait.',
    'status.qvacDown': 'qvac serve is not answering: {why}',

    'people.title': 'People',
    'people.add': 'Add a person',
    'people.name': 'Full name',
    'people.born': 'Date of birth',
    'people.all': 'Whole family',
    'people.docs': { one: '1 document', other: '{n} documents' },
    'people.empty': 'No people yet. Add the family members to file documents under the right name.',
    'people.unassigned': 'No person',

    'add.title': 'Add a document',
    'add.camera': 'Take a photo',
    'add.file': 'Choose a file',
    'add.hint': 'PDF or photo (JPEG, PNG, WebP). One photo per page, or one PDF with all the pages.',
    'add.person': 'Whose it is',
    'add.personAuto': 'The reader decides from the printed name',
    'add.uploading': 'Uploading…',
    'add.queued': 'Reading: {name}',
    'add.failed': 'Could not upload {name}: {why}',
    'add.done': 'Read: {name}. Now review it.',

    'review.title': 'To review',
    'review.empty': 'Nothing to review.',
    'review.reading': 'The reader is reading…',
    'review.readingPages': 'Reading, {n} pages',
    'review.failed': 'Reading failed: {why}',
    'review.retry': 'Read again',
    'review.intro': 'Check what the reader understood and correct it where needed. Nothing is filed before you confirm.',
    'review.confirm': 'Confirm and file',
    'review.confirmed': 'Filed.',
    'review.kind': 'Kind',
    'review.date': 'Date',
    'review.person': 'Person',
    'review.title.field': 'Title',
    'review.issuer': 'Issued by',
    'review.values': 'Values',
    'review.valuesHint': 'Each row is a value read from the page. Correct what does not match, remove wrong rows.',
    'review.addValue': 'Add a value',
    'review.removeValue': 'Remove',
    'review.col.name': 'Test',
    'review.col.value': 'Value',
    'review.col.unit': 'Unit',
    'review.col.ref': 'Reference',
    'review.col.flag': 'Flag',
    'review.text': 'Text as read',
    'review.medications': 'Medications',
    'review.followUps': 'Follow-ups',
    'review.amount': 'Amount',
    'review.personHint': 'Printed name: {name}',
    'review.edited': 'Edited by hand: {fields}',
    'review.readIn': 'Read by {model} in {s} s',

    'kind.lab_report': 'Lab report',
    'kind.letter': 'Letter / visit report',
    'kind.prescription': 'Prescription',
    'kind.vaccination': 'Vaccinations',
    'kind.imaging_report': 'Imaging report',
    'kind.discharge': 'Discharge letter',
    'kind.invoice': 'Invoice',
    'kind.insurance': 'Insurance',
    'kind.other': 'Other',

    'timeline.title': 'Documents',
    'timeline.empty': 'No documents yet.',
    'timeline.filter': 'Filter by kind',
    'timeline.allKinds': 'All kinds',
    'timeline.undated': 'undated',
    'timeline.state.reading': 'reading',
    'timeline.state.review': 'to review',
    'timeline.state.failed': 'reading failed',

    'values.title': 'Values over time',
    'values.empty': 'No numeric values filed for this person.',
    'values.latest': 'latest',
    'values.points': { one: '1 measurement', other: '{n} measurements' },
    'values.range': 'reference {range}',
    'values.high': 'high',
    'values.low': 'low',
    'values.chartTitle': '{name}, {n} measurements',
    'values.refBand': 'reference range',

    'doc.original': 'Open the original',
    'doc.reread': 'Read again',
    'doc.edit': 'Edit',
    'doc.filedOn': 'Filed on {date}',
    'doc.flag.H': 'high',
    'doc.flag.L': 'low',

    'footer.scope': "HealthFile reads, files and finds the family's documents. It makes no diagnosis: every decision is the doctor's.",
  },
};

let current = DEFAULT_LANG;
const listeners = new Set();
export const getLang = () => current;

export function supported(tag) {
  const s = String(tag ?? '').slice(0, 2).toLowerCase();
  return UI_LANGS.includes(s) ? s : null;
}
export function detectLang({ stored, server, browser } = {}) {
  return supported(stored) || supported(browser) || supported(server) || DEFAULT_LANG;
}
export function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (params[k] == null ? m : String(params[k])));
}
export function t(key, params = {}) {
  const entry = dictionaries[current]?.[key] ?? dictionaries.en[key];
  if (entry == null) return key;
  if (typeof entry === 'object') {
    const n = Number(params.n);
    return interpolate(n === 1 ? entry.one : entry.other, params);
  }
  return interpolate(entry, params);
}
export const locale = () => LOCALES[current] ?? LOCALES.en;
export function fmtDate(iso, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(locale(), options);
}
export function fmtNumber(n, options) {
  return new Intl.NumberFormat(locale(), options).format(n);
}
export function applyDom(root = typeof document === 'undefined' ? null : document) {
  if (!root) return;
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of root.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
  for (const n of root.querySelectorAll('[data-i18n-label]')) n.setAttribute('aria-label', t(n.dataset.i18nLabel));
  for (const n of root.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
  if (root === (typeof document === 'undefined' ? null : document)) document.documentElement.lang = current;
}
export function setLang(lang, { remember = false } = {}) {
  const next = supported(lang) || DEFAULT_LANG;
  const changed = next !== current;
  current = next;
  if (remember) {
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }
  applyDom();
  if (changed) for (const fn of listeners) fn(next);
  return next;
}
export function storedLang() {
  try {
    return supported(localStorage.getItem(LANG_KEY));
  } catch {
    return null;
  }
}
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
