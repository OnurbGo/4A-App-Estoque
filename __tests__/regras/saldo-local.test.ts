import {
  agoraDepois,
  calcularSaldos,
  contaLocalmente,
  movimentosDoLancamento,
  produtosDoEstoque,
  refletidaNoBootstrap,
  saldoDe,
} from '@/regras/saldo-local';
import type { ProdutosDoEstoque } from '@/regras/tipos';
import { lancamento } from './montagem';

const CASINHA = 1;
const BARRACAO = 2;
const CAMINHAO = 3;
const VERDICT = 10;
const KARATE = 11;

const base: ProdutosDoEstoque[] = [
  {
    estoque_id: CASINHA,
    produtos: [
      { produto_id: VERDICT, saldo: 13 },
      { produto_id: KARATE, saldo: 0.3 },
    ],
    recentes: [],
  },
  { estoque_id: BARRACAO, produtos: [{ produto_id: VERDICT, saldo: 2 }], recentes: [] },
];

const SEM_BOOTSTRAP = null;

describe('movimentosDoLancamento', () => {
  const itens = [{ produto_id: VERDICT, quantidade: 2 }];

  it.each(['SAIDA', 'APLICACAO', 'ABASTECIMENTO'] as const)('%s tira do estoque', (tipo) => {
    expect(movimentosDoLancamento({ tipo, estoque_id: CASINHA, itens })).toEqual([
      { estoque_id: CASINHA, produto_id: VERDICT, quantidade: -2 },
    ]);
  });

  it('Entrada soma no estoque', () => {
    expect(movimentosDoLancamento({ tipo: 'ENTRADA', estoque_id: CASINHA, itens })).toEqual([
      { estoque_id: CASINHA, produto_id: VERDICT, quantidade: 2 },
    ]);
  });

  it('Movimentação tira da origem e soma no destino', () => {
    expect(
      movimentosDoLancamento({
        tipo: 'MOVIMENTACAO',
        estoque_id: CASINHA,
        estoque_destino_id: CAMINHAO,
        itens,
      }),
    ).toEqual([
      { estoque_id: CASINHA, produto_id: VERDICT, quantidade: -2 },
      { estoque_id: CAMINHAO, produto_id: VERDICT, quantidade: 2 },
    ]);
  });
});

describe('o que conta no saldo local', () => {
  const inicioBootstrap = '2026-11-05T12:10:00.000Z';

  it.each(['PENDENTE', 'ERRO'] as const)('%s conta: ainda vai ser enviada', (status) => {
    expect(contaLocalmente({ status, enviado_em: null }, inicioBootstrap)).toBe(true);
  });

  it('RECUSADO não conta: nunca vai existir no servidor', () => {
    expect(contaLocalmente({ status: 'RECUSADO', enviado_em: null }, inicioBootstrap)).toBe(false);
  });

  it('ENVIADO depois do início do bootstrap ainda conta', () => {
    const operacao = { status: 'ENVIADO', enviado_em: '2026-11-05T12:10:01.000Z' } as const;

    expect(refletidaNoBootstrap(operacao, inicioBootstrap)).toBe(false);
    expect(contaLocalmente(operacao, inicioBootstrap)).toBe(true);
  });

  it('ENVIADO antes do início do bootstrap já está nele', () => {
    const operacao = { status: 'ENVIADO', enviado_em: '2026-11-05T12:09:59.000Z' } as const;

    expect(refletidaNoBootstrap(operacao, inicioBootstrap)).toBe(true);
    expect(contaLocalmente(operacao, inicioBootstrap)).toBe(false);
  });

  it('ENVIADO sem nenhum bootstrap conta', () => {
    const operacao = { status: 'ENVIADO', enviado_em: '2026-11-05T12:09:59.000Z' } as const;

    expect(contaLocalmente(operacao, SEM_BOOTSTRAP)).toBe(true);
  });
});

describe('calcularSaldos', () => {
  it('parte do bootstrap, mais e menos os lançamentos não enviados', () => {
    const saldos = calcularSaldos(
      base,
      [
        lancamento({ itens: [{ produto_id: VERDICT, quantidade: 2 }] }),
        lancamento({ tipo: 'ENTRADA', itens: [{ produto_id: VERDICT, quantidade: 5 }] }),
      ],
      SEM_BOOTSTRAP,
    );

    expect(saldoDe(saldos, CASINHA, VERDICT)).toBe(16);
  });

  it('conta a Movimentação nos dois estoques', () => {
    const saldos = calcularSaldos(
      base,
      [
        lancamento({
          tipo: 'MOVIMENTACAO',
          estoque_destino_id: BARRACAO,
          itens: [{ produto_id: VERDICT, quantidade: 3 }],
        }),
      ],
      SEM_BOOTSTRAP,
    );

    expect(saldoDe(saldos, CASINHA, VERDICT)).toBe(10);
    expect(saldoDe(saldos, BARRACAO, VERDICT)).toBe(5);
  });

  it('não acumula erro de ponto flutuante', () => {
    const saldos = calcularSaldos(
      base,
      [
        lancamento({ tipo: 'ENTRADA', itens: [{ produto_id: KARATE, quantidade: 0.1 }] }),
        lancamento({ tipo: 'ENTRADA', itens: [{ produto_id: KARATE, quantidade: 0.2 }] }),
      ],
      SEM_BOOTSTRAP,
    );

    expect(saldoDe(saldos, CASINHA, KARATE)).toBe(0.6);
  });

  it('pode ficar negativo', () => {
    const saldos = calcularSaldos(
      base,
      [lancamento({ itens: [{ produto_id: KARATE, quantidade: 1 }] })],
      SEM_BOOTSTRAP,
    );

    expect(saldoDe(saldos, CASINHA, KARATE)).toBe(-0.7);
  });

  it('ignora o recusado e o que o bootstrap já traz', () => {
    const saldos = calcularSaldos(
      base,
      [
        lancamento({ itens: [{ produto_id: VERDICT, quantidade: 1 }] }, { status: 'RECUSADO' }),
        lancamento(
          { itens: [{ produto_id: VERDICT, quantidade: 1 }] },
          { status: 'ENVIADO', enviado_em: '2026-11-05T12:00:00.000Z' },
        ),
      ],
      '2026-11-05T12:10:00.000Z',
    );

    expect(saldoDe(saldos, CASINHA, VERDICT)).toBe(13);
  });

  it('mantém o enviado que o bootstrap ainda não alcançou', () => {
    const saldos = calcularSaldos(
      base,
      [
        lancamento(
          { itens: [{ produto_id: VERDICT, quantidade: 1 }] },
          { status: 'ENVIADO', enviado_em: '2026-11-05T12:20:00.000Z' },
        ),
      ],
      '2026-11-05T12:10:00.000Z',
    );

    expect(saldoDe(saldos, CASINHA, VERDICT)).toBe(12);
  });

  it('cria saldo para produto novo no estoque', () => {
    const saldos = calcularSaldos(
      base,
      [lancamento({ tipo: 'ENTRADA', estoque_id: CAMINHAO })],
      SEM_BOOTSTRAP,
    );

    expect(saldoDe(saldos, CAMINHAO, VERDICT)).toBe(1);
  });

  it('produto sem lançamento no estoque tem saldo zero', () => {
    expect(saldoDe(calcularSaldos(base, [], SEM_BOOTSTRAP), CAMINHAO, VERDICT)).toBe(0);
  });
});

describe('agoraDepois', () => {
  const saldos = calcularSaldos(base, [], SEM_BOOTSTRAP);

  it('mostra o saldo antes e depois', () => {
    expect(
      agoraDepois(saldos, {
        tipo: 'SAIDA',
        estoque_id: CASINHA,
        itens: [{ produto_id: VERDICT, quantidade: 2 }],
      }),
    ).toEqual([
      {
        estoque_id: CASINHA,
        produto_id: VERDICT,
        agora: 13,
        depois: 11,
        vai_ficar_negativo: false,
      },
    ]);
  });

  it('avisa quando vai ficar negativo, sem bloquear', () => {
    const [linha] = agoraDepois(saldos, {
      tipo: 'SAIDA',
      estoque_id: CASINHA,
      itens: [{ produto_id: KARATE, quantidade: 0.5 }],
    });

    expect(linha).toMatchObject({ agora: 0.3, depois: -0.2, vai_ficar_negativo: true });
  });
});

describe('produtosDoEstoque', () => {
  const bootstrap = {
    produtos: [
      { id_almox_produto: VERDICT, nome: 'Verdict Max', unidade: 'L' as const },
      { id_almox_produto: KARATE, nome: 'Karate', unidade: 'L' as const },
      { id_almox_produto: 12, nome: 'Ácido', unidade: 'kg' as const },
    ],
  };

  it('traz só os do estoque, em ordem alfabética, com o saldo local', () => {
    const saldos = calcularSaldos(base, [], SEM_BOOTSTRAP);

    expect(
      produtosDoEstoque(bootstrap, CASINHA, saldos).map(({ nome, saldo }) => [nome, saldo]),
    ).toEqual([
      ['Karate', 0.3],
      ['Verdict Max', 13],
    ]);
  });

  it('inclui o produto que entrou no estoque e ainda não foi enviado', () => {
    const saldos = calcularSaldos(
      base,
      [lancamento({ tipo: 'ENTRADA', itens: [{ produto_id: 12, quantidade: 4 }] })],
      SEM_BOOTSTRAP,
    );

    expect(produtosDoEstoque(bootstrap, CASINHA, saldos)[0]).toMatchObject({
      nome: 'Ácido',
      saldo: 4,
    });
  });

  it('não traz produto que saiu do bootstrap', () => {
    const saldos = calcularSaldos(
      [{ estoque_id: CASINHA, produtos: [{ produto_id: 99, saldo: 1 }], recentes: [] }],
      [],
      SEM_BOOTSTRAP,
    );

    expect(produtosDoEstoque(bootstrap, CASINHA, saldos)).toEqual([]);
  });
});
