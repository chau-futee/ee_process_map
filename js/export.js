/* =============================================================================
   export.js — the Table View's "Download .xlsx" button.

   Writes one workbook with two sheets:
     Events      the rows the table is showing, in the table's order
     Change Log  the log entries for those rows only, in historical_log.json
                 order. An entry that matches no milestone (an orphan) is never
                 exported; the page lists orphans in the console on load.

   Values are written as they are in the JSON, with two exceptions:
     System  the full name from config.js NAME (pg -> Potential & Goals), on
             both sheets; an ID missing from NAME is written as the raw ID
     dates   all written YYYY-MM-DD, a missing day written "u" (2026-07-u)
   A null or empty value is a blank cell. Nothing is inferred into a blank.

   SheetJS (js/xlsx.mjs, downloaded separately from cdn.sheetjs.com) is loaded
   only when the button is clicked, so the rest of the page works without it.
   SheetJS 0.20.x refuses a sheet named "History" (any case; line 17861 of
   xlsx.mjs 0.20.3), which is why the second sheet is called Change Log.

   Any failure is shown to the reader with the error text, never swallowed.
   ============================================================================= */

import { key } from './detail.js';
import { NAME } from './config.js';

const FILE_PREFIX = 'EE Process Map Data - ';
const SHEETJS = './xlsx.mjs';
const SHEET_EVENTS = 'Events';
const SHEET_LOG = 'Change Log';

const EVENT_HEAD = ['System', 'Event Type', 'Event', 'Program Year', 'Due Date', 'Frequency',
  'Upward Dependencies', 'Status', 'Reference File', 'Reviewed By', 'Reviewed Date', 'Show'];
const HIST_HEAD = ['System', 'Event Type', 'Event', 'Program Year', 'Previous Date', 'New Date',
  'Reason', 'Reviewed By', 'Reviewed Date'];

const pad = n => String(n).padStart(2, '0');

/* null, undefined and '' become a blank cell; everything else is kept as is. */
const cell = v => (v === null || v === undefined || v === '' ? null : v);

/* Due Date, from the event's numeric y / m / d. */
function dueDate(e) {
  return `${e.y}-${pad(e.m)}-${e.d ? pad(e.d) : 'u'}`;
}

/* A date written in the JSON as text. The three formats found in the files:
     YYYY-MM-DD   kept
     YYYY-MM      day missing -> YYYY-MM-u
     M/D/YYYY     month first (confirmed) -> YYYY-MM-DD
   Anything else is written unchanged and named in the console, rather than
   guessed at. */
function textDate(v, where) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-u`;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${pad(mdy[1])}-${pad(mdy[2])}`;
  console.warn(`[export] unrecognised date format, written unchanged: ${where} = ${JSON.stringify(v)}`);
  return s;
}

/* System: full name from config.js, or the raw ID when NAME has no entry. */
const sysName = id => cell(Object.prototype.hasOwnProperty.call(NAME, id) ? NAME[id] : id);

const evKey = e => key(e.sys, e.py, e.event);
const where = e => `${e.sys}/${e.py} "${e.event}"`;

/* The two sheets as arrays of rows, header first. Kept apart from the
   download so it can be checked without a browser.
     shown  the rows the table is showing, in its order
     all    every record the table holds (to tell an orphan from a filtered row)
     log    historical_log.json "changes", in file order */
export function buildSheets(shown, all, log) {
  const events = [EVENT_HEAD, ...shown.map(e => [
    sysName(e.sys), cell(e.eventType), cell(e.event), cell(e.py), dueDate(e), cell(e.freq),
    cell(Array.isArray(e.upDeps) ? e.upDeps.join('; ') : e.upDeps),
    cell(e.status), cell(e.reference), cell(e.reviewedBy),
    textDate(e.reviewedDate, `${where(e)} reviewedDate`), cell(e.show),
  ])];

  /* Event Type for a log entry comes from the one event with the same key.
     Every key is unique in the current data; if that ever changes, the first
     match is used and the console says so. */
  const typeOf = new Map(), allKeys = new Set();
  for (const e of all) {
    const k = evKey(e);
    if (allKeys.has(k) && typeOf.get(k) !== e.eventType) {
      console.warn(`[export] several milestones share ${k}; Change Log uses the first one's Event Type`);
    }
    if (!allKeys.has(k)) typeOf.set(k, e.eventType);
    allKeys.add(k);
  }
  const shownKeys = new Set(shown.map(evKey));

  const history = [HIST_HEAD, ...(log || [])
    .filter(c => shownKeys.has(evKey(c)))
    .map(c => [
      sysName(c.sys), cell(typeOf.get(evKey(c))), cell(c.event), cell(c.py),
      textDate(c.previousDate, `${where(c)} previousDate`),
      textDate(c.newDate, `${where(c)} newDate`),
      cell(c.reason), cell(c.reviewedBy),
      textDate(c.reviewedDate, `${where(c)} reviewedDate`),
    ])];

  return { events, history };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function downloadXlsx(shown, all, log) {
  let XLSX;
  try {
    XLSX = await import(SHEETJS);
  } catch (err) {
    console.error('[export]', err);
    alert('The spreadsheet could not be created because js/xlsx.mjs did not load. '
      + 'Check that the file is saved in the js folder next to main.js.');
    return;
  }
  try {
    const { events, history } = buildSheets(shown, all, log);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(events), SHEET_EVENTS);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(history), SHEET_LOG);
    XLSX.writeFile(wb, `${FILE_PREFIX}${today()}.xlsx`);
  } catch (err) {
    console.error('[export]', err);
    alert(`The spreadsheet could not be created. Error: ${err && err.message ? err.message : err}`);
  }
}
