import { formatDateTime, formatQuantidade } from '@/utils/format';

describe('formatQuantidade', () => {
  it('usa vírgula e até três casas, na unidade do cadastro', () => {
    expect(formatQuantidade(13, 'L')).toBe('13 L');
    expect(formatQuantidade(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQuantidade(0.125, 'L')).toBe('0,125 L');
  });

  it('mostra negativo', () => {
    expect(formatQuantidade(-2.5, 'L')).toBe('-2,5 L');
  });
});

describe('formatDateTime', () => {
  it('devolve um traço sem data válida', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('não é data')).toBe('—');
  });

  it('formata uma data válida', () => {
    expect(formatDateTime('2026-11-05T12:30:00.000Z')).toMatch(/^\d{2}\/11\/2026/);
  });
});
