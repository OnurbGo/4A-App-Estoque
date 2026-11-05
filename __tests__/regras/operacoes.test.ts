import { corpoDaOperacao } from '@/regras/operacoes';
import type { DadosLancamento } from '@/regras/tipos';
import { lancamento, responsavel } from './montagem';

/** Os campos que o `LancamentoDto` aceita, mais o `responsavel_client_id` da sincronização. */
const CAMPOS_ACEITOS = new Set([
  'tipo',
  'motivo',
  'motivo_texto',
  'observacao',
  'estoque_id',
  'estoque_destino_id',
  'responsavel_id',
  'responsavel_client_id',
  'terceiro_entidade_id',
  'temperatura_c',
  'vento_kmh',
  'patrimonio_id',
  'medidor',
  'ocorrido_em',
  'itens',
]);

function dadosEnviados(operacao: ReturnType<typeof lancamento>): DadosLancamento {
  const corpo = corpoDaOperacao(operacao);
  if (corpo.tipo !== 'LANCAMENTO_CRIAR') throw new Error('Era um lançamento.');
  return corpo.dados;
}

describe('corpoDaOperacao', () => {
  it('monta o cadastro de responsável só com tipo, client_id e nome', () => {
    const operacao = responsavel('Ana', { seq: 3 });

    expect(corpoDaOperacao(operacao)).toEqual({
      tipo: 'RESPONSAVEL_CRIAR',
      client_id: operacao.client_id,
      nome: 'Ana',
    });
  });

  it('monta o lançamento com client_id e dados, sem os campos de controle', () => {
    const operacao = lancamento();
    const corpo = corpoDaOperacao(operacao);

    expect(Object.keys(corpo).sort()).toEqual(['client_id', 'dados', 'tipo']);
    expect(corpo.client_id).toBe(operacao.client_id);
  });

  it('nunca envia os nomes nem campo desconhecido, porque o servidor recusaria', () => {
    const operacao = lancamento({ observacao: 'Tudo certo' });
    (operacao.dados as Record<string, unknown>).nomes = operacao.nomes;
    (operacao.dados as Record<string, unknown>).campo_novo = 1;

    const dados = dadosEnviados(operacao);

    for (const campo of Object.keys(dados)) expect(CAMPOS_ACEITOS.has(campo)).toBe(true);
    expect(JSON.stringify(dados)).not.toContain('Casinha');
  });

  it('não envia campo vazio', () => {
    const dados = dadosEnviados(lancamento({ motivo: null, motivo_texto: null, medidor: null }));

    expect(dados).not.toHaveProperty('motivo');
    expect(dados).not.toHaveProperty('motivo_texto');
    expect(dados).not.toHaveProperty('medidor');
  });

  it('envia o responsável só por client_id quando ele foi criado no tablet', () => {
    const dados = dadosEnviados(
      lancamento({
        responsavel_id: 7,
        responsavel_client_id: '6f2b7a1e-1111-4222-8333-444455556666',
      }),
    );

    expect(dados.responsavel_client_id).toBe('6f2b7a1e-1111-4222-8333-444455556666');
    expect(dados).not.toHaveProperty('responsavel_id');
  });

  it('mantém o responsável por id quando ele veio do bootstrap', () => {
    expect(dadosEnviados(lancamento({ responsavel_id: 7 })).responsavel_id).toBe(7);
  });

  it('manda a quantidade com até 3 casas, como o servidor exige', () => {
    const dados = dadosEnviados(
      lancamento({ itens: [{ produto_id: 10, quantidade: 0.1 + 0.2 }] }),
    );

    expect(dados.itens).toEqual([{ produto_id: 10, quantidade: 0.3 }]);
  });

  it('leva só produto e quantidade em cada item', () => {
    const item = { produto_id: 10, quantidade: 1, nome: 'Verdict' };

    expect(dadosEnviados(lancamento({ itens: [item] })).itens).toEqual([
      { produto_id: 10, quantidade: 1 },
    ]);
  });
});
