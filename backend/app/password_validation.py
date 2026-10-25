from __future__ import annotations

import re
from typing import Optional


# Common sequences in keyboard rows or alphabets
SEQUENCES: list[str] = [
    "01234567890",
    "abcdefghijklmnopqrstuvwxyz",
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    "qwertyuiopasdfghjklzxcvbnm",
    "йцукенгшщзхъфывапролджэячсмитьбю",
]

COMMON_TRIVIAL_ROOTS: list[str] = [
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
]

SPECIAL_CHARACTERS = set("!@#$%^&*()_+-=[]{}|;:,.<>?/~`'\"\\№")


def extract_login_tokens(email_or_login: str) -> list[str]:
    """
    Extracts significant tokens and segments from an email address or login name.
    Example: 'Крипер2010@example.com' -> ['крипер2010', 'крипер', '2010']
    """
    if not email_or_login:
        return []

    local_part = email_or_login.partition("@")[0].strip().lower()
    if not local_part:
        return []

    tokens: set[str] = set()

    # Full local part if at least 3 chars
    if len(local_part) >= 3:
        tokens.add(local_part)

    # Word and numeric tokens (e.g. 'крипер' and '2010' from 'крипер2010')
    parts = re.findall(r"[a-zA-Zа-яёА-ЯЁ]+|\d+", local_part)
    for part in parts:
        if len(part) >= 3:
            tokens.add(part)

    # Segments split by delimiters (., _, -, +, etc.)
    delimited = re.split(r"[\._\-\+\s]+", local_part)
    for part in delimited:
        if len(part) >= 3:
            tokens.add(part)

    # Contiguous 4+ char substrings of the local part
    if len(local_part) >= 4:
        for i in range(len(local_part) - 3):
            tokens.add(local_part[i:i + 4])

    return sorted(tokens, key=lambda s: -len(s))


def validate_registration_password(password: str, email_or_login: Optional[str] = None) -> None:
    """
    Validates password strength for user/organizer registration:
    - Length between 12 and 128 characters.
    - Diversity: must contain at least one letter, one number, and one special character.
    - Prevents repetitive chunks (e.g. '123123123123', 'abcabcabcabc').
    - Prevents excessive repeated characters (e.g. 'aaaa', '1111').
    - Prevents sequential streaks (e.g. '12345', 'qwerty').
    - Prevents trivial root words (e.g. 'password', 'admin').
    - Prevents usage of login/email components (e.g. if login is 'Крипер2010', '2010' or 'крипер' are banned).
    """
    if not password or len(password) < 12:
        raise ValueError("Пароль должен содержать не менее 12 символов")
    if len(password) > 128:
        raise ValueError("Пароль не должен превышать 128 символов")

    # 1. Diversity check: letters, digits, and special characters
    has_letter = bool(re.search(r"[a-zA-Zа-яёА-ЯЁ]", password))
    has_digit = bool(re.search(r"\d", password))
    has_special = any(c in SPECIAL_CHARACTERS or (not c.isalnum() and not c.isspace()) for c in password)

    if not (has_letter and has_digit and has_special):
        missing: list[str] = []
        if not has_letter:
            missing.append("букву")
        if not has_digit:
            missing.append("цифру")
        if not has_special:
            missing.append("специальный символ (!@#$%^&*-_)")
        raise ValueError(f"Пароль должен содержать хотя бы одну {', '.join(missing)}")

    lower_pw = password.lower()

    # 2. Context-aware login/email token check
    if email_or_login:
        tokens = extract_login_tokens(email_or_login)
        for token in tokens:
            if token in lower_pw:
                raise ValueError(
                    f"Пароль не должен содержать фрагменты логина или email (найдено: «{token}»)"
                )

    # 3. Excessive identical repeated characters (4+ in a row, e.g. 'aaaa', '1111')
    if re.search(r"(.)\1{3,}", lower_pw):
        raise ValueError("Пароль не должен содержать более 3 одинаковых символов подряд")

    # 4. Repetitive chunk patterns (e.g. '123123123123', 'abcabcabcabc', 'qweqweqwe')
    alnum_pw = re.sub(r"[^a-zA-Zа-яёА-ЯЁ0-9]", "", lower_pw)
    if alnum_pw:
        for chunk_len in range(1, 6):
            if len(alnum_pw) >= chunk_len * 3:
                chunk = alnum_pw[:chunk_len]
                repeated = chunk * (len(alnum_pw) // chunk_len)
                if alnum_pw.startswith(repeated) and len(repeated) >= 8:
                    raise ValueError(f"Пароль слишком простой: обнаружен повторяющийся шаблон («{chunk}»)")

    # 5. Sequential keyboard/alphabetical streaks of length >= 5 (e.g. '12345', 'qwerty', 'abcde')
    for seq in SEQUENCES:
        rev_seq = seq[::-1]
        for s in (seq, rev_seq):
            for i in range(len(s) - 4):
                streak = s[i:i + 5]
                if streak in lower_pw:
                    raise ValueError(f"Пароль не должен содержать предсказуемые последовательности («{streak}»)")

    # 6. Common trivial dictionary roots
    for root in COMMON_TRIVIAL_ROOTS:
        if root in lower_pw and (len(lower_pw) - len(root) < 5):
            raise ValueError(f"Пароль содержит слишком простое ключевое слово («{root}»)")
