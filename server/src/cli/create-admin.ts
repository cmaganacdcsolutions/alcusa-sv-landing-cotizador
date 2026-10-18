// Usage: npm run admin:create -- <usuario> --prompt   (create)
//        npm run admin:create -- <usuario> --rotate   (reset the password of the existing admin)
// Hidden interactive input, TTY only; the password never travels in argv/env/file/logs.
import { parseCreateAdminArgs } from './create-admin-args.ts';
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
  const { username, mode } = parseCreateAdminArgs(process.argv.slice(2));
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Se requiere una terminal interactiva (TTY). No se acepta la contraseña por argv, env ni archivo.');
  const { auth, store, close } = createAdminRuntime(loadAdminConfig());
  try {
    const existing = await store.findUserByUsername(username);
    if (mode === 'rotate') {
      if (!existing) throw new Error('No existe ese usuario admin.');
      const p1 = await promptHidden('Nueva contraseña (min. 14): ');
      const p2 = await promptHidden('Repite la contraseña: ');
      if (p1 !== p2) throw new Error('Las contraseñas no coinciden.');
      await auth.rotatePassword(username, p1);
      process.stdout.write(`Contraseña de "${username}" restablecida. Sus sesiones abiertas fueron cerradas; deberá cambiarla en el próximo ingreso.
`);
      return;
    }
    if ((await store.countUsers()) > 0 && !existing) throw new Error('Ya existe una cuenta admin (v1.0 admite una sola).');
    if (existing) throw new Error('Ese usuario ya existe. Para restablecer su contraseña usa --rotate.');
    const p1 = await promptHidden('Contraseña inicial (min. 14): ');
    const p2 = await promptHidden('Repite la contraseña: ');
    if (p1 !== p2) throw new Error('Las contraseñas no coinciden.');
    await auth.createAdmin(username, p1, true);
    process.stdout.write(`Admin "${username}" creado. Deberá cambiar la contraseña en el primer ingreso.
`);
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : 'error'}\n`);
  process.exit(1);
});
