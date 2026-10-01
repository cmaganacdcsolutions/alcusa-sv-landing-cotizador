-- fixture: two statements, a semicolon inside a string and inside a comment; tail
CREATE TABLE IF NOT EXISTS fx_a (id INT NOT NULL PRIMARY KEY, note VARCHAR(40)) ENGINE=InnoDB;
INSERT INTO fx_a (id, note) VALUES (1, 'a;b') ON DUPLICATE KEY UPDATE note = VALUES(note);
