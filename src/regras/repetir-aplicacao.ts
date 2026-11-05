import type { OperacaoLancamento, OperacaoLocal, Produto, Unidade } from './tipos';

/** A última aplicação feita neste aparelho, qualquer que seja a situação do envio. */
export function ultimaAplicacao(operacoes: readonly OperacaoLocal[]): OperacaoLancamento | null {
  let ultima: OperacaoLancamento | null = null;

  for (const operacao of operacoes) {
    if (operacao.tipo !== 'LANCAMENTO_CRIAR' || operacao.dados.tipo !== 'APLICACAO') continue;
    if (!ultima || operacao.seq > ultima.seq) ultima = operacao;
  }

  return ultima;
}

export type ItemRepetido = {
  produto_id: number;
  nome: string;
  unidade: Unidade;
  quantidade: number;
};

/** Só produtos e quantidades: temperatura e vento são digitados de novo a cada aplicação. */
export type Repeticao = {
  itens: ItemRepetido[];
  /** Nomes dos produtos que saíram do bootstrap, para o aviso. */
  pulados: string[];
};

export function montarRepeticao(
  ultima: Pick<OperacaoLancamento, 'dados' | 'nomes'>,
  produtos: readonly Produto[],
): Repeticao {
  const porId = new Map(produtos.map((produto) => [produto.id_almox_produto, produto]));
  const itens: ItemRepetido[] = [];
  const pulados: string[] = [];

  for (const { produto_id, quantidade } of ultima.dados.itens) {
    const produto = porId.get(produto_id);
    if (produto) {
      itens.push({ produto_id, nome: produto.nome, unidade: produto.unidade, quantidade });
    } else {
      pulados.push(ultima.nomes.produtos[produto_id] ?? `Produto ${produto_id}`);
    }
  }

  return { itens, pulados };
}

export function avisoDeRepeticao(pulados: readonly string[]): string | null {
  if (pulados.length === 0) return null;
  const lista = pulados.join(', ');
  return pulados.length === 1
    ? `${lista} não está mais no cadastro e ficou de fora.`
    : `${lista} não estão mais no cadastro e ficaram de fora.`;
}
