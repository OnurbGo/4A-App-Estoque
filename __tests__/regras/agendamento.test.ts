import {
  bootstrapVencido,
  esperaDepoisDe,
  podeEnviar,
  proximaTentativaEm,
  registrarFalhaGeral,
  SEM_ESPERA,
  zeraEspera,
} from '@/regras/agendamento';

const MINUTO = 60_000;
const agora = new Date('2026-11-05T12:00:00.000Z');

describe('backoff', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 5],
    [4, 10],
    [5, 10],
    [50, 10],
  ])('depois de %i falhas, espera %i min', (falhas, minutos) => {
    expect(esperaDepoisDe(falhas)).toBe(minutos * MINUTO);
  });

  it('não dá espera negativa', () => {
    expect(esperaDepoisDe(0)).toBe(MINUTO);
  });

  it('calcula o horário da próxima tentativa', () => {
    expect(proximaTentativaEm(3, agora)).toBe('2026-11-05T12:05:00.000Z');
  });

  it('cada falha seguida aumenta a espera geral', () => {
    const primeira = registrarFalhaGeral(SEM_ESPERA, agora);
    const segunda = registrarFalhaGeral(primeira, agora);

    expect(primeira).toEqual({
      falhas_seguidas: 1,
      proxima_tentativa_em: '2026-11-05T12:01:00.000Z',
    });
    expect(segunda).toEqual({
      falhas_seguidas: 2,
      proxima_tentativa_em: '2026-11-05T12:02:00.000Z',
    });
  });
});

describe('quando enviar', () => {
  const emEspera = { falhas_seguidas: 3, proxima_tentativa_em: '2026-11-05T12:05:00.000Z' };

  it('sem conexão, nunca tenta', () => {
    expect(podeEnviar('ABRIR', SEM_ESPERA, false, agora)).toBe(false);
    expect(podeEnviar('CONEXAO_VOLTOU', SEM_ESPERA, false, agora)).toBe(false);
  });

  it('sem espera, tenta em qualquer gatilho', () => {
    expect(podeEnviar('TIMER', SEM_ESPERA, true, agora)).toBe(true);
    expect(podeEnviar('LANCAMENTO', SEM_ESPERA, true, agora)).toBe(true);
  });

  it.each(['ABRIR', 'CONEXAO_VOLTOU'] as const)('%s zera a espera', (gatilho) => {
    expect(zeraEspera(gatilho)).toBe(true);
    expect(podeEnviar(gatilho, emEspera, true, agora)).toBe(true);
  });

  it.each(['LANCAMENTO', 'TIMER'] as const)('%s respeita a espera', (gatilho) => {
    expect(zeraEspera(gatilho)).toBe(false);
    expect(podeEnviar(gatilho, emEspera, true, agora)).toBe(false);
    expect(podeEnviar(gatilho, emEspera, true, new Date('2026-11-05T12:05:00.000Z'))).toBe(true);
  });
});

describe('bootstrapVencido', () => {
  it('sem nenhum bootstrap, precisa buscar', () => {
    expect(bootstrapVencido(null, agora)).toBe(true);
  });

  it('vale por 15 min', () => {
    expect(bootstrapVencido('2026-11-05T11:45:01.000Z', agora)).toBe(false);
    expect(bootstrapVencido('2026-11-05T11:45:00.000Z', agora)).toBe(true);
  });
});
