import { describe, expect, it } from "vitest";
import { extractLoginTokens, validatePassword } from "./passwordValidation";

describe("passwordValidation", () => {
  it("extracts meaningful tokens from email or login", () => {
    const tokens = extractLoginTokens("Крипер2010@mail.ru");
    expect(tokens).toContain("2010");
    expect(tokens).toContain("крипер");
    expect(tokens).toContain("крипер2010");
  });

  it("extracts delimited tokens", () => {
    const tokens = extractLoginTokens("ivan.ivanov-99@domain.com");
    expect(tokens).toContain("ivan");
    expect(tokens).toContain("ivanov");
    expect(tokens).toContain("ivan.ivanov-99");
  });

  it("rejects passwords shorter than 12 characters", () => {
    const result = validatePassword("Short1!", "user@test.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/не менее 12 символов/);
  });

  it("requires letter, digit, and special symbol", () => {
    const noDigit = validatePassword("NoDigitsHere!@#$", "user@test.com");
    expect(noDigit.valid).toBe(false);
    expect(noDigit.error).toMatch(/цифру/);

    const noLetter = validatePassword("1234567890!@#$", "user@test.com");
    expect(noLetter.valid).toBe(false);
    expect(noLetter.error).toMatch(/букву/);

    const noSpecial = validatePassword("NoSpecialChars1234", "user@test.com");
    expect(noSpecial.valid).toBe(false);
    expect(noSpecial.error).toMatch(/специальный символ/);
  });

  it("rejects repetitive patterns like 123123123123", () => {
    const result = validatePassword("123123123123!a", "user@test.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/повторяющийся шаблон/);
  });

  it("rejects repetitive words like abcabcabcabc", () => {
    const result = validatePassword("abcabcabcabc!1", "user@test.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/повторяющийся шаблон/);
  });

  it("rejects sequential keyboard patterns like qwerty or 12345", () => {
    const result = validatePassword("qwerty!2026Pass", "user@test.com");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/предсказуемые последовательности/);

    const resDigits = validatePassword("12345!PassSecure", "user@test.com");
    expect(resDigits.valid).toBe(false);
    expect(resDigits.error).toMatch(/предсказуемые последовательности/);
  });

  it("rejects passwords containing login parts like 2010 or Крипер from Крипер2010", () => {
    const login = "Крипер2010@mail.ru";

    const res2010 = validatePassword("SuperPass2010!#", login);
    expect(res2010.valid).toBe(false);
    expect(res2010.error).toContain("2010");

    const resKriper = validatePassword("Крипер_Pass1234!", login);
    expect(resKriper.valid).toBe(false);
    expect(resKriper.error).toContain("крипер");
  });

  it("accepts strong valid passwords", () => {
    const result = validatePassword("Strong!Pass#2026", "kriper2010@mail.ru");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
