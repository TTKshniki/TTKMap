const SEQUENCES: string[] = [
  "01234567890",
  "abcdefghijklmnopqrstuvwxyz",
  "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
  "qwertyuiopasdfghjklzxcvbnm",
  "йцукенгшщзхъфывапролджэячсмитьбю",
];

const COMMON_TRIVIAL_ROOTS: string[] = [
  "password",
  "admin",
  "administrator",
  "root",
  "qwerty",
  "welcome",
  "letmein",
  "changeme",
  "master",
  "пароль",
  "админ",
  "секрет",
];

const SPECIAL_CHARACTERS = new Set("!@#$%^&*()_+-=[]{}|;:,.<>?/~`'\"\\№".split(""));

export function extractLoginTokens(emailOrLogin: string): string[] {
  if (!emailOrLogin) return [];
  const localPart = emailOrLogin.split("@")[0].trim().toLowerCase();
  if (!localPart) return [];

  const tokens = new Set<string>();

  if (localPart.length >= 3) {
    tokens.add(localPart);
  }

  // Word and numeric chunks (e.g. 'крипер' and '2010' from 'крипер2010')
  const parts = localPart.match(/[a-za-яё0-9]+/gi) || [];
  for (const p of parts) {
    const wordNums = p.match(/[a-za-яё]+|\d+/gi) || [];
    for (const sub of wordNums) {
      if (sub.length >= 3) {
        tokens.add(sub.toLowerCase());
      }
    }
    if (p.length >= 3) {
      tokens.add(p.toLowerCase());
    }
  }

  // Split by delimiters
  const delimited = localPart.split(/[\._\-\+\s]+/);
  for (const part of delimited) {
    if (part.length >= 3) {
      tokens.add(part.toLowerCase());
    }
  }

  // Substrings of length >= 4
  if (localPart.length >= 4) {
    for (let i = 0; i <= localPart.length - 4; i++) {
      tokens.add(localPart.slice(i, i + 4));
    }
  }

  return Array.from(tokens).sort((a, b) => b.length - a.length);
}

export function validatePassword(
  password: string,
  emailOrLogin?: string
): { valid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return { valid: false, error: "Пароль должен содержать не менее 12 символов" };
  }
  if (password.length > 128) {
    return { valid: false, error: "Пароль не должен превышать 128 символов" };
  }

  const hasLetter = /[a-zA-Zа-яёА-ЯЁ]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = Array.from(password).some(
    (c) => SPECIAL_CHARACTERS.has(c) || (!/[a-zA-Zа-яёА-ЯЁ0-9\s]/.test(c))
  );

  if (!hasLetter || !hasDigit || !hasSpecial) {
    const missing: string[] = [];
    if (!hasLetter) missing.push("букву");
    if (!hasDigit) missing.push("цифру");
    if (!hasSpecial) missing.push("специальный символ (!@#$%^&*-_)");
    return {
      valid: false,
      error: `Пароль должен содержать хотя бы одну ${missing.join(", ")}`,
    };
  }

  const lowerPw = password.toLowerCase();

  // Context-aware login token check (e.g. Крипер2010 -> 2010, крипер)
  if (emailOrLogin) {
    const tokens = extractLoginTokens(emailOrLogin);
    for (const token of tokens) {
      if (lowerPw.includes(token)) {
        return {
          valid: false,
          error: `Пароль не должен содержать фрагменты логина или email (найдено: «${token}»)`,
        };
      }
    }
  }

  // Consecutive identical characters (>= 4)
  if (/(.)\1{3,}/.test(lowerPw)) {
    return {
      valid: false,
      error: "Пароль не должен содержать более 3 одинаковых символов подряд",
    };
  }

  // Repetitive chunk patterns (e.g. 123123123123, abcabcabcabc)
  const alnumPw = lowerPw.replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, "");
  if (alnumPw) {
    for (let chunkLen = 1; chunkLen <= 5; chunkLen++) {
      if (alnumPw.length >= chunkLen * 3) {
        const chunk = alnumPw.slice(0, chunkLen);
        const repeatCount = Math.floor(alnumPw.length / chunkLen);
        const repeated = chunk.repeat(repeatCount);
        if (alnumPw.startsWith(repeated) && repeated.length >= 8) {
          return {
            valid: false,
            error: `Пароль слишком простой: обнаружен повторяющийся шаблон («${chunk}»)`,
          };
        }
      }
    }
  }

  // Sequential keyboard runs (>= 5)
  for (const seq of SEQUENCES) {
    const revSeq = seq.split("").reverse().join("");
    for (const s of [seq, revSeq]) {
      for (let i = 0; i <= s.length - 5; i++) {
        const streak = s.slice(i, i + 5);
        if (lowerPw.includes(streak)) {
          return {
            valid: false,
            error: `Пароль не должен содержать предсказуемые последовательности («${streak}»)`,
          };
        }
      }
    }
  }

  // Common trivial dictionary roots
  for (const root of COMMON_TRIVIAL_ROOTS) {
    if (lowerPw.includes(root) && lowerPw.length - root.length < 5) {
      return {
        valid: false,
        error: `Пароль содержит слишком простое ключевое слово («${root}»)`,
      };
    }
  }

  return { valid: true };
}
