import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from '../../src/db/sql-split.ts';

describe('splitSqlStatements', () => {
  it('splits on semicolons and drops comment-only chunks', () => {
    expect(splitSqlStatements('-- hi\nCREATE TABLE a (id INT);\n;\n/* block */;\nDROP TABLE a; -- trailing\n')).toEqual([
      '-- hi\nCREATE TABLE a (id INT)',
      'DROP TABLE a',
    ]);
  });

  it('does not split inside strings, backticks, or comments', () => {
    const sql = "INSERT INTO t VALUES ('a;b', \"c;d\", 'it''s; ok'); -- x;y\nSELECT `we;ird`; /* ; */ SELECT 2;";
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("'it''s; ok'");
    expect(out[1]).toContain('`we;ird`');
  });

  it('keeps MariaDB executable comments', () => {
    expect(splitSqlStatements('/*M!100100 SET @a = 1 */;')).toEqual(['/*M!100100 SET @a = 1 */']);
  });

  it('honors DELIMITER for routine bodies', () => {
    const sql = 'DELIMITER //\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END//\nDELIMITER ;\nSELECT 3;';
    expect(splitSqlStatements(sql)).toEqual(['CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END', 'SELECT 3']);
  });

  it('handles a final statement without a terminator and rejects unterminated quotes', () => {
    expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1']);
    expect(() => splitSqlStatements("SELECT 'oops;")).toThrowError(/Unterminated/);
  });
});
