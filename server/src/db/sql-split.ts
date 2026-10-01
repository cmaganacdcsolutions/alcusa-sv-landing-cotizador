/**
 * Splits a SQL script into statements, mysql-client style.
 * Handles: `;` terminators, `DELIMITER x` client commands (stored routines),
 * '..' ".." `..` quoting (with '' and backslash escapes), and -- / # / block
 * comments. Comments inside a statement are kept verbatim (so MariaDB
 * executable comments, the M-bang and bang forms, survive); statements made only of
 * comments/whitespace are dropped. Input should be LF-normalized.
 */
export function splitSqlStatements(script: string): string[] {
  const out: string[] = [];
  let delimiter = ';';
  let buf = '';
  let i = 0;
  const n = script.length;

  const flush = (): void => {
    const stmt = buf.trim();
    buf = '';
    if (stmt && hasCode(stmt)) out.push(stmt);
  };

  while (i < n) {
    const ch = script.charAt(i);
    // DELIMITER command: only at the start of a line while no statement is pending.
    if (buf.trim() === '' && /^delimiter[ \t]/i.test(script.slice(i, i + 10))) {
      const eol = script.indexOf('\n', i);
      const end = eol === -1 ? n : eol;
      const next = script.slice(i + 9, end).trim();
      if (!next) throw new Error('DELIMITER without a value');
      delimiter = next;
      buf = '';
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) {
        const c = script.charAt(j);
        if (c === '\\' && ch !== '`') {
          j += 2;
          continue;
        }
        if (c === ch) {
          if (script.charAt(j + 1) === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      if (j >= n) throw new Error('Unterminated quoted string in SQL script');
      buf += script.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '#' || script.startsWith('-- ', i) || script.startsWith('--\n', i) || script.startsWith('--\t', i)) {
      const eol = script.indexOf('\n', i);
      const end = eol === -1 ? n : eol;
      buf += script.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '/' && script.charAt(i + 1) === '*') {
      const close = script.indexOf('*/', i + 2);
      if (close === -1) throw new Error('Unterminated block comment in SQL script');
      buf += script.slice(i, close + 2);
      i = close + 2;
      continue;
    }
    if (script.startsWith(delimiter, i)) {
      flush();
      i += delimiter.length;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** True when the text has something besides whitespace and comments. */
function hasCode(stmt: string): boolean {
  const stripped = stmt
    .replace(/\/\*(?!M?!)[\s\S]*?\*\//g, '')
    .replace(/(^|\n)[ \t]*(--[ \t]|--$|#)[^\n]*/g, '$1')
    .trim();
  return stripped.length > 0;
}
