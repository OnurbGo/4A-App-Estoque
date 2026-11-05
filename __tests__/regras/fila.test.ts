import {
  aplicarResultadoAnexo,
  aplicarResultados,
  escolherAnexos,
  escolherLote,
  fotoRecusadaPeloServidor,
  recusarAnexo,
  TAMANHO_LOTE,
  type AnexoPendente,
} from '@/regras/fila';
import { lancamento, responsavel } from './montagem';

const agora = new Date('2026-11-05T12:00:00.000Z');

const anexo = (parcial: Partial<AnexoPendente> = {}): AnexoPendente => ({
  client_id: 'anexo-1',
  lancamento_client_id: 'lancamento-1',
  caminho: 'file:///anexos/anexo-1.jpg',
  status: 'PENDENTE',
  tentativas: 0,
  mensagem: null,
  proxima_tentativa_em: null,
  criado_em: '2026-11-05T11:00:00.000Z',
  ...parcial,
});

describe('escolherLote', () => {
  it('segue a ordem de criação, não a do relógio nem a da lista', () => {
    const primeira = lancamento({}, { seq: 1, criado_em: '2026-11-05T15:00:00.000Z' });
    const segunda = responsavel('Ana', { seq: 2, criado_em: '2026-11-05T09:00:00.000Z' });
    const terceira = lancamento({}, { seq: 3 });

    expect(escolherLote([terceira, segunda, primeira], agora).map(({ seq }) => seq)).toEqual([
      1, 2, 3,
    ]);
  });

  it('manda no máximo 50 por lote', () => {
    const operacoes = Array.from({ length: 120 }, (_, i) => lancamento({}, { seq: i + 1 }));

    const lote = escolherLote(operacoes, agora);

    expect(TAMANHO_LOTE).toBe(50);
    expect(lote).toHaveLength(50);
    expect(lote.at(-1)?.seq).toBe(50);
  });

  it('pega PENDENTE e ERRO; ENVIADO e RECUSADO saíram da fila', () => {
    const operacoes = [
      lancamento({}, { seq: 1, status: 'PENDENTE' }),
      lancamento({}, { seq: 2, status: 'ERRO' }),
      lancamento({}, { seq: 3, status: 'ENVIADO' }),
      lancamento({}, { seq: 4, status: 'RECUSADO' }),
    ];

    expect(escolherLote(operacoes, agora).map(({ seq }) => seq)).toEqual([1, 2]);
  });

  it('respeita a espera de cada operação', () => {
    const operacoes = [
      lancamento({}, { seq: 1, status: 'ERRO', proxima_tentativa_em: '2026-11-05T12:01:00.000Z' }),
      lancamento({}, { seq: 2, status: 'ERRO', proxima_tentativa_em: '2026-11-05T12:00:00.000Z' }),
    ];

    expect(escolherLote(operacoes, agora).map(({ seq }) => seq)).toEqual([2]);
  });

  it('50 operações presas no início não travam as que vêm depois', () => {
    const presas = Array.from({ length: 50 }, (_, i) =>
      lancamento(
        {},
        {
          seq: i + 1,
          status: 'ERRO',
          tentativas: 9,
          proxima_tentativa_em: '2026-11-05T12:10:00.000Z',
        },
      ),
    );
    const nova = lancamento({}, { seq: 51 });

    expect(escolherLote([...presas, nova], agora).map(({ seq }) => seq)).toEqual([51]);
  });
});

describe('aplicarResultados', () => {
  it('SINCRONIZADO vira ENVIADO e guarda o id do lançamento', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'SINCRONIZADO', lancamento_id: 42 }],
      agora,
    );

    expect(alteracao).toEqual({
      client_id: operacao.client_id,
      status: 'ENVIADO',
      tentativas: 1,
      mensagem: null,
      id_servidor: 42,
      enviado_em: agora.toISOString(),
      proxima_tentativa_em: null,
    });
  });

  it('JA_SINCRONIZADO também vira ENVIADO: o reenvio nunca duplica', () => {
    const operacao = lancamento({}, { status: 'ERRO', tentativas: 2 });

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'JA_SINCRONIZADO', lancamento_id: 42 }],
      agora,
    );

    expect(alteracao).toMatchObject({ status: 'ENVIADO', id_servidor: 42, tentativas: 3 });
  });

  it('guarda o id do responsável criado', () => {
    const operacao = responsavel('Ana');

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'SINCRONIZADO', responsavel_id: 9 }],
      agora,
    );

    expect(alteracao?.id_servidor).toBe(9);
  });

  it('ENVIADO sem id na resposta continua ENVIADO', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'SINCRONIZADO' }],
      agora,
    );

    expect(alteracao).toMatchObject({ status: 'ENVIADO', id_servidor: null });
  });

  it('RECUSADO sem mensagem ainda explica o que houve', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'RECUSADO' }],
      agora,
    );

    expect(alteracao?.mensagem).toBe('O servidor recusou esta operação.');
  });

  it('TENTAR_NOVAMENTE sem mensagem mantém a anterior', () => {
    const operacao = lancamento({}, { status: 'ERRO', tentativas: 1, mensagem: 'Repita.' });

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'TENTAR_NOVAMENTE' }],
      agora,
    );

    expect(alteracao?.mensagem).toBe('Repita.');
  });

  it('RECUSADO sai da fila com a mensagem do servidor', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'RECUSADO', mensagem: 'Campo inválido: itens.' }],
      agora,
    );

    expect(alteracao).toMatchObject({
      status: 'RECUSADO',
      mensagem: 'Campo inválido: itens.',
      enviado_em: null,
      proxima_tentativa_em: null,
    });
  });

  it('TENTAR_NOVAMENTE fica na fila, nunca é perdido (D23)', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'TENTAR_NOVAMENTE', mensagem: 'Repita.' }],
      agora,
    );

    expect(alteracao).toMatchObject({
      status: 'ERRO',
      tentativas: 1,
      mensagem: 'Repita.',
      enviado_em: null,
      proxima_tentativa_em: '2026-11-05T12:01:00.000Z',
    });
    expect(
      escolherLote([{ ...operacao, ...alteracao! }], new Date('2026-11-05T12:01:00.000Z')),
    ).toHaveLength(1);
  });

  it('cada TENTAR_NOVAMENTE seguido espera mais', () => {
    const operacao = lancamento({}, { status: 'ERRO', tentativas: 3 });

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'TENTAR_NOVAMENTE' }],
      agora,
    );

    expect(alteracao?.proxima_tentativa_em).toBe('2026-11-05T12:10:00.000Z');
  });

  it('operação ausente na resposta continua na fila', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados([operacao], [], agora);

    expect(alteracao).toMatchObject({ status: 'ERRO', tentativas: 1 });
    expect(alteracao?.mensagem).toMatch(/não respondeu/);
  });

  it('status desconhecido continua na fila', () => {
    const operacao = lancamento();

    const [alteracao] = aplicarResultados(
      [operacao],
      [{ client_id: operacao.client_id, status: 'NOVIDADE' }],
      agora,
    );

    expect(alteracao?.status).toBe('ERRO');
  });

  it('casa pela client_id, mesmo com a resposta fora de ordem', () => {
    const a = lancamento({}, { seq: 1 });
    const b = lancamento({}, { seq: 2 });

    const alteracoes = aplicarResultados(
      [a, b],
      [
        { client_id: b.client_id, status: 'RECUSADO', mensagem: 'Não.' },
        { client_id: a.client_id, status: 'SINCRONIZADO', lancamento_id: 1 },
      ],
      agora,
    );

    expect(alteracoes.map(({ status }) => status)).toEqual(['ENVIADO', 'RECUSADO']);
  });

  it('uma operação recusada não afeta as outras do lote', () => {
    const a = lancamento({}, { seq: 1 });
    const b = lancamento({}, { seq: 2 });
    const c = lancamento({}, { seq: 3 });

    const alteracoes = aplicarResultados(
      [a, b, c],
      [
        { client_id: a.client_id, status: 'SINCRONIZADO', lancamento_id: 1 },
        { client_id: b.client_id, status: 'RECUSADO', mensagem: 'Não.' },
        { client_id: c.client_id, status: 'TENTAR_NOVAMENTE' },
      ],
      agora,
    );

    expect(alteracoes.map(({ status }) => status)).toEqual(['ENVIADO', 'RECUSADO', 'ERRO']);
  });
});

describe('fotos', () => {
  const enviado = lancamento({}, { client_id: 'lancamento-1', status: 'ENVIADO' });

  it.each(['PENDENTE', 'ERRO', 'RECUSADO'] as const)(
    'não sobe enquanto o lançamento está %s',
    (status) => {
      const operacao = lancamento({}, { client_id: 'lancamento-1', status });

      expect(escolherAnexos([anexo()], [operacao], agora)).toEqual([]);
    },
  );

  it('sobe depois do lançamento enviado', () => {
    expect(escolherAnexos([anexo()], [enviado], agora)).toHaveLength(1);
  });

  it('respeita a espera e não reenvia foto recusada', () => {
    const anexos = [
      anexo({ proxima_tentativa_em: '2026-11-05T12:01:00.000Z' }),
      anexo({ client_id: 'anexo-2', status: 'RECUSADO' }),
    ];

    expect(escolherAnexos(anexos, [enviado], agora)).toEqual([]);
  });

  it.each(['SINCRONIZADO', 'JA_SINCRONIZADO'] as const)('%s tira a foto do aparelho', (status) => {
    expect(aplicarResultadoAnexo(anexo(), status, agora)).toBeNull();
  });

  it('AGUARDANDO_LANCAMENTO mantém a foto para reenviar', () => {
    expect(aplicarResultadoAnexo(anexo(), 'AGUARDANDO_LANCAMENTO', agora)).toEqual({
      client_id: 'anexo-1',
      status: 'PENDENTE',
      tentativas: 1,
      mensagem: null,
      proxima_tentativa_em: '2026-11-05T12:01:00.000Z',
    });
  });

  it('só 400 e 413 recusam a foto de vez', () => {
    expect(fotoRecusadaPeloServidor(400)).toBe(true);
    expect(fotoRecusadaPeloServidor(413)).toBe(true);
    expect(fotoRecusadaPeloServidor(401)).toBe(false);
    expect(fotoRecusadaPeloServidor(500)).toBe(false);
  });

  it('guarda o motivo da recusa', () => {
    expect(recusarAnexo(anexo(), 'A foto deve ter até 5 MB.')).toEqual({
      client_id: 'anexo-1',
      status: 'RECUSADO',
      tentativas: 1,
      mensagem: 'A foto deve ter até 5 MB.',
      proxima_tentativa_em: null,
    });
  });
});
