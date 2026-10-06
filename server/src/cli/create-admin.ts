// Usage: npm run admin:create -- <usuario> --prompt   (hidden interactive input, TTY only; never argv/env/file)
import { createAdminRuntime, loadAdminConfig } from '../modules/admin/runtime.ts';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolveP) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch: string): void => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolveP(buf);
          return;
        }
        if (c.charCodeAt(0) === 3) process.exit(130); // Ctrl+C
        if (c.charCodeAt(0) === 127 || c.charCodeAt(0) === 8) buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const [username, flag] = process.argv.slice(2);
  if (!username || flag !== '--prompt') throw new Error('Uso: create-admin <usuario> --prompt');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Se requiere una terminal interactiva (TTY). No se acepta la contraseña por argv, env ni archivo.');
  const { auth, store } = createAdminRuntime(loadAdminConfig());
  if ((await store.countUsers()) > 0 && !(await store.findUserByUsername(username))) throw new Error('Ya existe una cuenta admin (v1.0 admite una sola).');
  if (await store.findUserByUsername(username)) throw new Error('Ese usuario ya existe (rotación: pendiente, ver HANDOFF).');
  const p1 = await promptHidden('Contraseña inicial (min. 14): ');
  const p2 = await promptHidden('Repite la contraseña: ');
  if (p1 !== p2) throw new Error('Las contraseñas no coinciden.');
  await auth.createAdmin(username, p1, true);
  process.stdout.write(`Admin "${username}" creado. Deberá cambiar la contraseña en el primer ingreso.\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : 'error'}\n`);
  process.exit(1);
});
