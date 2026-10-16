// specs/04 §1: the only password-policy implementation (mirrored on the client).
// Unicode-aware; length is counted in code points ([...v].length), not UTF-16 code units.
export const PASSWORD_RULES = {
  length: (v: string) => {
    const n = [...v].length;
    return n >= 8 && n <= 128;
  },
  letter: (v: string) => /\p{L}/u.test(v),
  number: (v: string) => /\p{N}/u.test(v),
  special: (v: string) => /[^\p{L}\p{N}]/u.test(v),
};
