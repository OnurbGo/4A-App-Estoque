import type {
  Bootstrap,
  DadosLancamento,
  OperacaoLancamento,
  OperacaoLocal,
  Produto,
  ProdutosDoEstoque,
} from './tipos';

/** O saldo é somado em milésimos inteiros: a soma em ponto flutuante acumula erro. */
const ESCALA = 1000;

const emMilesimos = (valor: number) => Math.round(valor * ESCALA);

export type Movimento = { estoque_id: number; produto_id: number; quantidade: number };

export type SaldosLocais = ReadonlyMap<string, number>;

type CamposDoMovimento = Pick<
  DadosLancamento,
  'tipo' | 'estoque_id' | 'estoque_destino_id' | 'itens'
>;

const chave = (estoqueId: number, produtoId: number) => `${estoqueId}:${produtoId}`;

/** Os mesmos movimentos que o servidor gera para cada tipo de lançamento. */
export function movimentosDoLancamento(dados: CamposDoMovimento): Movimento[] {
  const { tipo, estoque_id, estoque_destino_id, itens } = dados;

  return itens.flatMap(({ produto_id, quantidade }) => {
    if (tipo === 'ENTRADA') return [{ estoque_id, produto_id, quantidade }];

    const saida = { estoque_id, produto_id, quantidade: -quantidade };
    if (tipo === 'MOVIMENTACAO' && estoque_destino_id != null) {
      return [saida, { estoque_id: estoque_destino_id, produto_id, quantidade }];
    }
    return [saida];
  });
}

/**
 * O bootstrap já traz esta operação? Só quando ele começou depois de ela ter sido enviada.
 * Sem isso, o saldo voltaria errado se a conexão caísse entre o envio e o bootstrap.
 */
export function refletidaNoBootstrap(
  operacao: Pick<OperacaoLocal, 'status' | 'enviado_em'>,
  bootstrapIniciadoEm: string | null,
): boolean {
  if (operacao.status !== 'ENVIADO' || !operacao.enviado_em || !bootstrapIniciadoEm) return false;
  return Date.parse(operacao.enviado_em) <= Date.parse(bootstrapIniciadoEm);
}

/** Recusada nunca vai existir no servidor. Em `ERRO`, ainda vai ser enviada. */
export function contaLocalmente(
  operacao: Pick<OperacaoLocal, 'status' | 'enviado_em'>,
  bootstrapIniciadoEm: string | null,
): boolean {
  return operacao.status !== 'RECUSADO' && !refletidaNoBootstrap(operacao, bootstrapIniciadoEm);
}

export function lancamentosLocais(
  operacoes: readonly OperacaoLocal[],
  bootstrapIniciadoEm: string | null,
): OperacaoLancamento[] {
  return operacoes.filter(
    (operacao): operacao is OperacaoLancamento =>
      operacao.tipo === 'LANCAMENTO_CRIAR' && contaLocalmente(operacao, bootstrapIniciadoEm),
  );
}

/** Saldo de cada produto em cada estoque: o do bootstrap, mais e menos o que ele ainda não traz. */
export function calcularSaldos(
  produtosPorEstoque: readonly ProdutosDoEstoque[],
  operacoes: readonly OperacaoLocal[],
  bootstrapIniciadoEm: string | null,
): SaldosLocais {
  const milesimos = new Map<string, number>();

  for (const { estoque_id, produtos } of produtosPorEstoque) {
    for (const { produto_id, saldo } of produtos) {
      milesimos.set(chave(estoque_id, produto_id), emMilesimos(saldo));
    }
  }

  for (const { dados } of lancamentosLocais(operacoes, bootstrapIniciadoEm)) {
    for (const { estoque_id, produto_id, quantidade } of movimentosDoLancamento(dados)) {
      const id = chave(estoque_id, produto_id);
      milesimos.set(id, (milesimos.get(id) ?? 0) + emMilesimos(quantidade));
    }
  }

  return new Map([...milesimos].map(([id, valor]) => [id, valor / ESCALA]));
}

export function saldoDe(saldos: SaldosLocais, estoqueId: number, produtoId: number): number {
  return saldos.get(chave(estoqueId, produtoId)) ?? 0;
}

export type AgoraDepois = {
  estoque_id: number;
  produto_id: number;
  agora: number;
  depois: number;
  /** "Vai ficar negativo": só avisa, nunca bloqueia (regra 15). */
  vai_ficar_negativo: boolean;
};

export function agoraDepois(saldos: SaldosLocais, dados: CamposDoMovimento): AgoraDepois[] {
  return movimentosDoLancamento(dados).map(({ estoque_id, produto_id, quantidade }) => {
    const agora = saldoDe(saldos, estoque_id, produto_id);
    const depois = (emMilesimos(agora) + emMilesimos(quantidade)) / ESCALA;
    return { estoque_id, produto_id, agora, depois, vai_ficar_negativo: depois < 0 };
  });
}

export type ProdutoComSaldo = Produto & { saldo: number };

/**
 * Os produtos do estoque com o saldo local, em ordem alfabética (regra 14): os que têm lançamento
 * nele, inclusive um produto novo que entrou aqui e ainda não foi enviado.
 */
export function produtosDoEstoque(
  bootstrap: Pick<Bootstrap, 'produtos'>,
  estoqueId: number,
  saldos: SaldosLocais,
): ProdutoComSaldo[] {
  return bootstrap.produtos
    .filter(({ id_almox_produto: id }) => saldos.has(chave(estoqueId, id)))
    .map((produto) => ({
      ...produto,
      saldo: saldoDe(saldos, estoqueId, produto.id_almox_produto),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
