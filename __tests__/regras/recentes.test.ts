import { recentesDoEstoque } from '@/regras/recentes';
import type { Produto } from '@/regras/tipos';
import { lancamento } from './montagem';

const produtos: Produto[] = [1, 2, 3, 4, 5, 6, 7, 10].map((id) => ({
  id_almox_produto: id,
  nome: `Produto ${id}`,
  unidade: 'L',
}));

const bootstrap = {
  produtos,
  produtos_por_estoque: [
    { estoque_id: 1, produtos: [], recentes: [1, 2, 3, 4, 5] },
    { estoque_id: 2, produtos: [], recentes: [] },
  ],
};

describe('recentesDoEstoque', () => {
  it('sem nada local, são os do bootstrap', () => {
    expect(recentesDoEstoque(bootstrap, 1, [], null)).toEqual([1, 2, 3, 4, 5]);
  });

  it('o não enviado vem primeiro, do mais novo para o mais antigo', () => {
    const operacoes = [
      lancamento({ itens: [{ produto_id: 6, quantidade: 1 }] }, { seq: 1 }),
      lancamento({ itens: [{ produto_id: 7, quantidade: 1 }] }, { seq: 2 }),
    ];

    expect(recentesDoEstoque(bootstrap, 1, operacoes, null)).toEqual([7, 6, 1, 2, 3]);
  });

  it('não repete produto', () => {
    const operacoes = [lancamento({ itens: [{ produto_id: 3, quantidade: 1 }] })];

    expect(recentesDoEstoque(bootstrap, 1, operacoes, null)).toEqual([3, 1, 2, 4, 5]);
  });

  it('a Movimentação entra nos dois estoques', () => {
    const operacoes = [
      lancamento({
        tipo: 'MOVIMENTACAO',
        estoque_id: 1,
        estoque_destino_id: 2,
        itens: [{ produto_id: 6, quantidade: 1 }],
      }),
    ];

    expect(recentesDoEstoque(bootstrap, 2, operacoes, null)).toEqual([6]);
    expect(recentesDoEstoque(bootstrap, 1, operacoes, null)[0]).toBe(6);
  });

  it('não conta lançamento recusado', () => {
    const operacoes = [
      lancamento({ itens: [{ produto_id: 6, quantidade: 1 }] }, { status: 'RECUSADO' }),
    ];

    expect(recentesDoEstoque(bootstrap, 1, operacoes, null)).toEqual([1, 2, 3, 4, 5]);
  });

  it('não traz produto que saiu do bootstrap', () => {
    const operacoes = [lancamento({ itens: [{ produto_id: 99, quantidade: 1 }] })];

    expect(recentesDoEstoque(bootstrap, 1, operacoes, null)).toEqual([1, 2, 3, 4, 5]);
  });

  it('estoque fora do bootstrap fica só com o local', () => {
    const operacoes = [lancamento({ tipo: 'ENTRADA', estoque_id: 3 })];

    expect(recentesDoEstoque(bootstrap, 3, operacoes, null)).toEqual([10]);
  });
});
