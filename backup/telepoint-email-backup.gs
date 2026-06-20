/**
 * TelePoint → daily email backup.
 *
 * Once a day this pulls EVERY table from the portal's /api/backup feed
 * (all customers, all columns, all history), packs them as CSV files into a
 * single dated .zip, and emails it to you. customers.csv is also attached on
 * its own so you can open it without unzipping.
 *
 * It reuses the same secured endpoint and BACKUP_TOKEN as the Google-Sheet and
 * GitHub-Actions mirrors — no extra service, no email provider, no server
 * change. Delivery uses your own Google account's mail quota (one email/day is
 * far within the limit) and works to any address, including Hotmail/Outlook.
 *
 * ── SETUP (one time, ~2 minutes) ─────────────────────────────────────────────
 *   1. Go to https://script.google.com → New project (or open the Apps Script
 *      project of your existing backup Sheet → add a file).
 *   2. Paste this whole file in.
 *   3. Project Settings (gear) → Script properties → add:
 *        PORTAL_URL    e.g. https://your-portal.vercel.app
 *        BACKUP_TOKEN  the same secret set as BACKUP_TOKEN on the server
 *        BACKUP_EMAIL  where to send it (defaults to kamfrens62@hotmail.com)
 *   4. Select the function `setupDailyEmailTrigger` → Run. Approve the
 *      authorization prompt once. This installs a trigger that runs
 *      `emailDailyBackup` every day (~07:00) and sends one immediately so you
 *      can confirm it arrives.
 *
 * To change the time/frequency, edit `atHour(7)` in setupDailyEmailTrigger.
 * To stop, run `removeDailyEmailTrigger`.
 */

// Tables included in the backup. Each becomes one CSV in the zip.
var TABLES = [
  'retailers',
  'customers',
  'emi_schedule',
  'payment_requests',
  'payment_request_items',
  'fine_settings',
  'broadcast_messages',
  'audit_log',
];

// Fallback recipient if the BACKUP_EMAIL script property isn't set.
var DEFAULT_EMAIL = 'kamfrens62@hotmail.com';

function _config_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('PORTAL_URL');
  var token = props.getProperty('BACKUP_TOKEN');
  var email = props.getProperty('BACKUP_EMAIL') || DEFAULT_EMAIL;
  if (!url || !token) {
    throw new Error('Set PORTAL_URL and BACKUP_TOKEN in Project Settings → Script properties.');
  }
  return { url: url.replace(/\/+$/, ''), token: token, email: email };
}

function _fetchJson_(cfg, path) {
  var res = UrlFetchApp.fetch(cfg.url + path, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + cfg.token },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('GET ' + path + ' failed (HTTP ' + code + '): ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

/** One CSV cell — quote when it contains a comma, quote, or newline. */
function _csvCell_(v) {
  if (v === null || v === undefined) return '';
  var s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Build a UTF-8 CSV blob (with BOM so Excel renders Unicode correctly). */
function _csvBlob_(table, payload) {
  var columns = payload.columns || [];
  var rows = payload.rows || [];
  var lines = [];
  if (columns.length === 0) {
    lines.push('(no rows) — generated ' + (payload.generated_at || ''));
  } else {
    lines.push(columns.map(_csvCell_).join(','));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var line = [];
      for (var c = 0; c < columns.length; c++) {
        line.push(_csvCell_(row[columns[c]]));
      }
      lines.push(line.join(','));
    }
  }
  var csv = '﻿' + lines.join('\r\n');
  return Utilities.newBlob(csv, 'text/csv', table + '.csv');
}

/**
 * Pulls every table, builds a dated zip of CSVs, and emails it.
 * Safe to run on a timer or by hand.
 */
function emailDailyBackup() {
  // Guard against an overlapping manual + scheduled run.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    var cfg = _config_();
    var manifest = _fetchJson_(cfg, '/api/backup'); // { generated_at, tables: [{table,count}] }
    var dateStr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');

    var blobs = [];
    var customersBlob = null;
    var summaryLines = [];
    var totalRows = 0;

    for (var i = 0; i < TABLES.length; i++) {
      var table = TABLES[i];
      try {
        var payload = _fetchJson_(cfg, '/api/backup?table=' + encodeURIComponent(table));
        var blob = _csvBlob_(table, payload);
        blobs.push(blob);
        if (table === 'customers') customersBlob = blob.copyBlob().setName('customers-' + dateStr + '.csv');
        var n = (payload.rows || []).length;
        totalRows += n;
        summaryLines.push('• ' + table + ': ' + n + ' rows');
      } catch (err) {
        summaryLines.push('• ' + table + ': ERROR ' + err.message);
      }
    }

    var zip = Utilities.zip(blobs, 'telepoint-backup-' + dateStr + '.zip');
    var attachments = [zip];
    if (customersBlob) attachments.push(customersBlob); // quick-open, no unzip

    var customerCount = 0;
    for (var t = 0; t < (manifest.tables || []).length; t++) {
      if (manifest.tables[t].table === 'customers') customerCount = manifest.tables[t].count;
    }

    var body =
      'TelePoint database backup — ' + dateStr + ' (IST)\n\n' +
      'Customers: ' + customerCount + '\n' +
      'Total rows across all tables: ' + totalRows + '\n' +
      'Source generated_at: ' + (manifest.generated_at || '') + '\n\n' +
      summaryLines.join('\n') + '\n\n' +
      'Attached:\n' +
      '  • telepoint-backup-' + dateStr + '.zip  (every table as CSV — full details)\n' +
      '  • customers-' + dateStr + '.csv          (all customers, all columns)\n\n' +
      'This is an automated daily backup. Keep these files safe.';

    MailApp.sendEmail({
      to: cfg.email,
      subject: 'TelePoint backup ' + dateStr + ' — ' + customerCount + ' customers',
      body: body,
      attachments: attachments,
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Installs a once-a-day trigger for emailDailyBackup (~07:00 script time) and
 * sends one immediately. Re-running replaces any existing trigger (no stacking).
 */
function setupDailyEmailTrigger() {
  removeDailyEmailTrigger();
  ScriptApp.newTrigger('emailDailyBackup').timeBased().everyDays(1).atHour(7).create();
  emailDailyBackup(); // send the first one now so you can confirm it arrives
}

/** Removes the daily email trigger (stops automatic backups). */
function removeDailyEmailTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'emailDailyBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
