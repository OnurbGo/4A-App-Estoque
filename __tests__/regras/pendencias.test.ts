import type { AnexoPendente } from '@/regras/fila';
import { indicadorDeEnvio, motivoDaFalha } from '@/regras/indicador';
import {
  montarPendencias,
  resumirPendencias,
  TENTATIVAS_PARA_PRESA,
} from '@/regras/pendencias';
import { lancamento, responsavel } from './montagem';

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

describe('montarPendencias', () => {
  it('nada pendente, lista vazia', () => {
    expect(montarPendencias([lancamento({}, { status: 'ENVIADO' })], [])).toEqual([]);
  });

  it('mostra o lançamento pendente com os nomes gravados', () => {
    const [item] = montarPendencias([lancamento()], []);

    expect(item).toMatchObject({
      situacao: 'AGUARDANDO',
      titulo: 'Saída · Carlos',
      detalhe: 'Verdict · Casinha de defensivos',
      orientacao: null,
    });
  });

  it('mostra origem e destino na Movimentação', () => {
    const operacao = lancamento({ tipo: 'MOVIMENTACAO', estoque_destino_id: 2 });
    operacao.nomes.estoque_destino = 'Barracão de Adubo';

    expect(montarPendencias([operacao], [])[0]?.detalhe).toBe(
      'Verdict · de Casinha de defensivos para Barracão de Adubo',
    );
  });

  it('não quebra se o nome do produto não foi gravado', () => {
    const operacao = lancamento({ itens: [{ produto_id: 99, quantidade: 1 }] });

    expect(montarPendencias([operacao], [])[0]?.detalhe).toBe(
      'Produto 99 · Casinha de defensivos',
    );
  });

  it('TENTAR_NOVAMENTE aparece desde a primeira vez, com a mensagem do servidor', () => {
    const [item] = montarPendencias(
      [lancamento({}, { status: 'ERRO', tentativas: 1, mensagem: 'Repita.' })],
      [],
    );

    expect(item).toMatchObject({ situacao: 'AGUARDANDO', mensagem: 'Repita.', tentativas: 1 });
  });

  it('preso em TENTAR_NOVAMENTE aparece como PRESA', () => {
    const [item] = montarPendencias(
      [lancamento({}, { status: 'ERRO', tentativas: TENTATIVAS_PARA_PRESA })],
      [],
    );

    expect(item?.situacao).toBe('PRESA');
    expect(item?.orientacao).toMatch(/continua sendo repetido/);
  });

  it('lançamento de responsável recusado aparece como PRESA, mesmo sem tentativa (D23)', () => {
    const recusado = responsavel('Zé', { status: 'RECUSADO', mensagem: 'Nome inválido.' });
    const preso = lancamento({ responsavel_id: null, responsavel_client_id: recusado.client_id });

    const itens = montarPendencias([recusado, preso], []);
    const item = itens.find(({ id }) => id === preso.client_id);

    expect(item).toMatchObject({ situacao: 'PRESA', mensagem: 'Nome inválido.' });
    expect(item?.orientacao).toMatch(/cadastro de Zé foi recusado/);
  });

  it('lançamento de responsável que ainda vai chegar não é preso', () => {
    const novo = responsavel('Zé');
    const operacao = lancamento({ responsavel_id: null, responsavel_client_id: novo.client_id });

    const item = montarPendencias([novo, operacao], []).find(
      ({ id }) => id === operacao.client_id,
    );

    expect(item?.situacao).toBe('AGUARDANDO');
  });

  it('recusado fica na lista, com a orientação de Baixa manual', () => {
    const [item] = montarPendencias(
      [lancamento({}, { status: 'RECUSADO', mensagem: 'Campo inválido.' })],
      [],
    );

    expect(item).toMatchObject({ situacao: 'RECUSADA', mensagem: 'Campo inválido.' });
    expect(item?.orientacao).toMatch(/Baixa manual/);
  });

  it('mostra o cadastro de responsável recusado e o preso', () => {
    const itens = montarPendencias(
      [
        responsavel('Ana', { status: 'RECUSADO', mensagem: 'Nome inválido.' }),
        responsavel('Bia', { status: 'ERRO', tentativas: 5 }),
        responsavel('Caio'),
      ],
      [],
    );

    expect(itens.map(({ titulo, situacao }) => [titulo, situacao])).toEqual([
      ['Cadastro de Ana', 'RECUSADA'],
      ['Cadastro de Bia', 'PRESA'],
      ['Cadastro de Caio', 'AGUARDANDO'],
    ]);
  });

  it('o que precisa de atenção vem primeiro', () => {
    const itens = montarPendencias(
      [
        lancamento({}, { seq: 1 }),
        lancamento({}, { seq: 2, status: 'ERRO', tentativas: 3 }),
        lancamento({}, { seq: 3, status: 'RECUSADO' }),
      ],
      [],
    );

    expect(itens.map(({ situacao }) => situacao)).toEqual(['RECUSADA', 'PRESA', 'AGUARDANDO']);
  });

  it('a foto de lançamento na fila vai junto dele', () => {
    const operacao = lancamento({}, { client_id: 'lancamento-1' });

    expect(montarPendencias([operacao], [anexo()])).toEqual([
      expect.objectContaining({ id: 'lancamento-1', fotos: 1 }),
    ]);
  });

  it('a foto de lançamento recusado vai junto dele', () => {
    const operacao = lancamento({}, { client_id: 'lancamento-1', status: 'RECUSADO' });

    expect(montarPendencias([operacao], [anexo()])).toEqual([
      expect.objectContaining({ id: 'lancamento-1', fotos: 1, situacao: 'RECUSADA' }),
    ]);
  });

  it('a foto de lançamento enviado aparece sozinha', () => {
    const operacao = lancamento({}, { client_id: 'lancamento-1', status: 'ENVIADO' });

    expect(montarPendencias([operacao], [anexo()])).toEqual([
      expect.objectContaining({
        id: 'anexo-1',
        situacao: 'AGUARDANDO',
        titulo: 'Foto · Saída · Carlos',
      }),
    ]);
  });

  it('a foto recusada aparece sozinha, com o motivo', () => {
    const operacao = lancamento({}, { client_id: 'lancamento-1', status: 'ENVIADO' });

    const [item] = montarPendencias(
      [operacao],
      [anexo({ status: 'RECUSADO', mensagem: 'A foto deve ter até 5 MB.' })],
    );

    expect(item).toMatchObject({ situacao: 'RECUSADA', mensagem: 'A foto deve ter até 5 MB.' });
    expect(item?.orientacao).toMatch(/registrado sem ela/);
  });

  it('foto que continua falhando aparece como PRESA, com o motivo', () => {
    const operacao = lancamento({}, { client_id: 'lancamento-1', status: 'ENVIADO' });

    const [item] = montarPendencias(
      [operacao],
      [anexo({ tentativas: TENTATIVAS_PARA_PRESA, mensagem: 'O servidor teve um problema.' })],
    );

    expect(item).toMatchObject({ situacao: 'PRESA', mensagem: 'O servidor teve um problema.' });
    expect(item?.orientacao).toMatch(/continua sendo repetido/);
  });

  it('foto nas primeiras tentativas ainda só aguarda', () => {
    const operacao = lancamento({}, { client_id: 'lancamento-1', status: 'ENVIADO' });

    const [item] = montarPendencias([operacao], [anexo({ tentativas: 2 })]);

    expect(item?.situacao).toBe('AGUARDANDO');
  });

  it('não quebra com foto sem lançamento conhecido', () => {
    expect(montarPendencias([], [anexo()])[0]?.titulo).toBe('Foto de um lançamento');
  });
});

describe('resumirPendencias e indicador', () => {
  const resumoDe = (...operacoes: Parameters<typeof montarPendencias>[0]) =>
    resumirPendencias(montarPendencias(operacoes, []));

  it('Tudo enviado', () => {
    expect(indicadorDeEnvio(resumoDe(lancamento({}, { status: 'ENVIADO' })), true)).toEqual({
      estado: 'TUDO_ENVIADO',
      texto: 'Tudo enviado',
      atencao: null,
      falha: null,
    });
  });

  it('N aguardando envio', () => {
    expect(indicadorDeEnvio(resumoDe(lancamento(), lancamento()), true)).toEqual({
      estado: 'AGUARDANDO',
      texto: '2 aguardando envio',
      atencao: null,
      falha: null,
    });
  });

  it('Sem conexão', () => {
    expect(indicadorDeEnvio(resumoDe(lancamento()), false)).toEqual({
      estado: 'SEM_CONEXAO',
      texto: 'Sem conexão',
      atencao: null,
      falha: null,
    });
  });

  it('a presa continua aguardando e pede atenção', () => {
    const resumo = resumoDe(lancamento({}, { status: 'ERRO', tentativas: 3 }));

    expect(resumo).toEqual({ aguardando: 1, atencao: 1 });
    expect(indicadorDeEnvio(resumo, true)).toMatchObject({
      texto: '1 aguardando envio',
      atencao: '1 precisa de atenção',
    });
  });

  it('a recusada não aguarda envio, mas não some da vista', () => {
    const resumo = resumoDe(
      lancamento({}, { status: 'RECUSADO' }),
      lancamento({}, { status: 'RECUSADO' }),
    );

    expect(resumo).toEqual({ aguardando: 0, atencao: 2 });
    expect(indicadorDeEnvio(resumo, true)).toMatchObject({
      texto: 'Tudo enviado',
      atencao: '2 precisam de atenção',
    });
  });

  it('3 lançamentos e uma foto contam como 3 até os lançamentos saírem', () => {
    const operacoes = [
      lancamento({}, { seq: 1, client_id: 'lancamento-1' }),
      lancamento({}, { seq: 2 }),
      lancamento({}, { seq: 3 }),
    ];

    expect(resumirPendencias(montarPendencias(operacoes, [anexo()])).aguardando).toBe(3);
  });
});

describe('falha do pedido inteiro', () => {
  const SEM_ACESSO = { statusCode: 403, mensagem: 'Esta conta não tem acesso aos tablets.' };
  const SEM_REDE = { statusCode: 0, mensagem: 'Sem conexão com o servidor.' };
  const resumo = { aguardando: 2, atencao: 0 };

  it('mostra o motivo junto do que aguarda envio', () => {
    expect(indicadorDeEnvio(resumo, true, SEM_ACESSO)).toEqual({
      estado: 'AGUARDANDO',
      texto: '2 aguardando envio',
      atencao: null,
      falha: 'Esta conta não tem acesso aos tablets.',
    });
  });

  it('aparece mesmo sem nada para enviar: os cadastros também não atualizam', () => {
    expect(indicadorDeEnvio({ aguardando: 0, atencao: 0 }, true, SEM_ACESSO)).toMatchObject({
      texto: 'Tudo enviado',
      falha: 'Esta conta não tem acesso aos tablets.',
    });
  });

  it('sem rede, não repete o motivo: "Sem conexão" já diz', () => {
    expect(motivoDaFalha(SEM_REDE, true)).toBeNull();
  });

  it('desconectado, não mostra um motivo que pode estar velho', () => {
    expect(motivoDaFalha(SEM_ACESSO, false)).toBeNull();
    expect(indicadorDeEnvio(resumo, false, SEM_ACESSO).falha).toBeNull();
  });

  it('sem falha, sem motivo', () => {
    expect(motivoDaFalha(null, true)).toBeNull();
  });
});
