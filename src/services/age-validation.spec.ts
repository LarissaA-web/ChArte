import { describe, expect, it } from 'vitest';
import { hasMinimumAge, latestEligibleBirthDate } from './age-validation';

describe('validação de idade mínima', () => {
  const today = new Date(2026, 5, 10);

  it('considera ano, mês e dia no aniversário de 16 anos', () => {
    expect(hasMinimumAge('2010-06-10', 16, today)).toBe(true);
    expect(hasMinimumAge('2010-06-11', 16, today)).toBe(false);
  });

  it('rejeita datas futuras e inválidas', () => {
    expect(hasMinimumAge('2026-06-11', 0, today)).toBe(false);
    expect(hasMinimumAge('2010-02-30', 16, today)).toBe(false);
    expect(hasMinimumAge('', 16, today)).toBe(false);
  });

  it('define a data máxima selecionável sem erro de fuso ou ano bissexto', () => {
    expect(latestEligibleBirthDate(16, today)).toBe('2010-06-10');
    expect(latestEligibleBirthDate(16, new Date(2024, 1, 29))).toBe('2008-02-29');
  });
});
