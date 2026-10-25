from __future__ import annotations

import pytest

from backend.app.password_validation import extract_login_tokens, validate_registration_password


def test_extract_login_tokens():
    tokens = extract_login_tokens("Крипер2010@mail.ru")
    assert "2010" in tokens
    assert "крипер" in tokens
    assert "крипер2010" in tokens

    tokens_dots = extract_login_tokens("alex.smith_99@example.com")
    assert "alex" in tokens_dots
    assert "smith" in tokens_dots
    assert "alex.smith_99" in tokens_dots


def test_validate_password_diversity():
    # Missing digit
    with pytest.raises(ValueError, match="цифру"):
        validate_registration_password("NoDigitsHere!@#", "user@test.com")

    # Missing letter
    with pytest.raises(ValueError, match="букву"):
        validate_registration_password("1234567890!@#$", "user@test.com")

    # Missing special character
    with pytest.raises(ValueError, match="специальный символ"):
        validate_registration_password("NoSpecialChars12345", "user@test.com")

    # Short password
    with pytest.raises(ValueError, match="не менее 12 символов"):
        validate_registration_password("Short1!", "user@test.com")


def test_validate_password_repetitive_and_sequential():
    # Repetitive pattern 123123123123
    with pytest.raises(ValueError, match="повторяющийся шаблон"):
        validate_registration_password("123123123123!a", "user@test.com")

    with pytest.raises(ValueError, match="повторяющийся шаблон"):
        validate_registration_password("abcabcabcabc!1", "user@test.com")

    # Excessive identical chars
    with pytest.raises(ValueError, match="более 3 одинаковых символов"):
        validate_registration_password("aaaa12345678!B", "user@test.com")

    # Keyboard sequences
    with pytest.raises(ValueError, match="предсказуемые последовательности"):
        validate_registration_password("qwerty!2026Pass", "user@test.com")

    with pytest.raises(ValueError, match="предсказуемые последовательности"):
        validate_registration_password("12345!SecurePass", "user@test.com")


def test_validate_password_login_tokens():
    # User example: Крипер2010
    login = "Крипер2010@example.com"

    # Password containing '2010'
    with pytest.raises(ValueError, match="найдено: «2010»"):
        validate_registration_password("SuperSecret2010!#", login)

    # Password containing 'Крипер'
    with pytest.raises(ValueError, match="найдено: «крипер»"):
        validate_registration_password("Крипер_Super1234!", login)

    # Valid password not containing tokens
    validate_registration_password("Strong!Secure#Pass2026", login)
