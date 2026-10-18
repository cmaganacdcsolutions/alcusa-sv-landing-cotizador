// Argument parsing for create-admin. The password is never an argument: only `<usuario>` and one mode flag.
export type CreateAdminMode = 'create' | 'rotate';

export function parseCreateAdminArgs(argv: string[]): { username: string; mode: CreateAdminMode } {
  const [username, flag, ...rest] = argv;
  const usage = 'Uso: create-admin <usuario> --prompt   (crear)  |  create-admin <usuario> --rotate   (restablecer contraseña)';
  if (!username || rest.length > 0 || (flag !== '--prompt' && flag !== '--rotate')) throw new Error(usage);
  return { username, mode: flag === '--rotate' ? 'rotate' : 'create' };
}
