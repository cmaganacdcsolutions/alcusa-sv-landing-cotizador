// 2FA seam (ADR-014 §3.4). v1.0 runs with ADMIN_MFA_MODE=off: every successful password goes straight
// to 'active'. v1.1 implements TotpSecondFactor and flips the mode; no schema or flow change needed.
export type Stage = 'password_ok' | 'mfa_pending' | 'active';
export type MfaMode = 'off' | 'optional' | 'required';

export interface StageUser {
  mfaMethod: 'totp' | null;
  totpEnabledAt: Date | null;
}

export interface SecondFactor {
  isEnrolled(user: StageUser): boolean;
  verify(user: StageUser, input: string): Promise<{ ok: boolean }>;
}

/** v1.0: nobody is enrolled and nothing verifies. */
export const NullSecondFactor: SecondFactor = {
  isEnrolled: () => false,
  verify: () => Promise.resolve({ ok: false }),
};

/** The single place that decides the session stage after a correct password. */
export function nextStage(user: StageUser, mode: MfaMode, factor: SecondFactor = NullSecondFactor): Stage {
  if (mode === 'off') return 'active';
  if (mode === 'required') return 'mfa_pending';
  return factor.isEnrolled(user) || user.totpEnabledAt !== null ? 'mfa_pending' : 'active';
}
