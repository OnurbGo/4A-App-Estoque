import { lancamentosLocais, movimentosDoLancamento } from './saldo-local';
import type { Bootstrap, OperacaoLocal } from './tipos';

export const RECENTES_POR_ESTOQUE = 5;

/**
 * Os produtos usados por último no estoque, do mais novo para o mais antigo. O que o bootstrap
 * ainda não traz é mais novo que tudo que ele traz.
 */
export function recentesDoEstoque(
  bootstrap: Pick<Bootstrap, 'produtos' | 'produtos_por_estoque'>,
  estoqueId: number,
  operacoes: readonly OperacaoLocal[],
  bootstrapIniciadoEm: string | null,
  limite = RECENTES_POR_ESTOQUE,
): number[] {
  const ativos = new Set(bootstrap.produtos.map(({ id_almox_produto }) => id_almox_produto));

  const locais = lancamentosLocais(operacoes, bootstrapIniciadoEm)
    .sort((a, b) => b.seq - a.seq)
    .flatMap(({ dados }) => movimentosDoLancamento(dados))
    .filter(({ estoque_id }) => estoque_id === estoqueId)
    .map(({ produto_id }) => produto_id);

  const doBootstrap =
    bootstrap.produtos_por_estoque.find(({ estoque_id }) => estoque_id === estoqueId)?.recentes ??
    [];

  const unicos = new Set([...locais, ...doBootstrap].filter((id) => ativos.has(id)));
  return [...unicos].slice(0, limite);
}
