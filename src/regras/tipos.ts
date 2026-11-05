/** Contrato da API dos tablets (Parte A.6) e o que o app guarda dele no aparelho. */

export type EstoqueGrupo = 'INSUMOS' | 'COMBUSTIVEL';
export type Unidade = 'L' | 'kg';
export type TipoMedidor = 'HORAS' | 'QUILOMETROS';

export type LancamentoTipo = 'SAIDA' | 'ENTRADA' | 'MOVIMENTACAO' | 'APLICACAO' | 'ABASTECIMENTO';

export type LancamentoMotivo =
  | 'EMPRESTIMO'
  | 'DEVOLUCAO_TERCEIROS'
  | 'ENTRADA_PRODUTOS'
  | 'OUTROS';

export type Estoque = { id_almox_estoque: number; nome: string; grupo: EstoqueGrupo };
export type Produto = { id_almox_produto: number; nome: string; unidade: Unidade };
export type SaldoProduto = { produto_id: number; saldo: number };

export type ProdutosDoEstoque = {
  estoque_id: number;
  produtos: SaldoProduto[];
  recentes: number[];
};

export type Responsavel = { id_almox_responsavel: number; nome: string };
export type Terceiro = { id_entidade: number; nome: string };

export type Maquina = {
  id_patrimonio: number;
  nome: string;
  tipo_medidor: TipoMedidor;
  medidor_atual: number | null;
};

export type Bootstrap = {
  estoques: Estoque[];
  produtos: Produto[];
  produtos_por_estoque: ProdutosDoEstoque[];
  responsaveis: Responsavel[];
  terceiros: Terceiro[];
  maquinas: Maquina[];
  motivos: Partial<Record<LancamentoTipo, LancamentoMotivo[]>>;
};

export type ItemLancamento = { produto_id: number; quantidade: number };

/** Exatamente o que vai em `dados`: o servidor recusa qualquer campo a mais. */
export type DadosLancamento = {
  tipo: LancamentoTipo;
  motivo?: LancamentoMotivo | null;
  motivo_texto?: string | null;
  observacao?: string | null;
  estoque_id: number;
  estoque_destino_id?: number | null;
  responsavel_id?: number | null;
  responsavel_client_id?: string | null;
  terceiro_entidade_id?: number | null;
  temperatura_c?: number | null;
  vento_kmh?: number | null;
  patrimonio_id?: number | null;
  medidor?: number | null;
  ocorrido_em: string;
  itens: ItemLancamento[];
};

/** Fica só no aparelho, para mostrar o lançamento mesmo se o cadastro mudar depois. */
export type NomesLancamento = {
  responsavel: string;
  estoque: string;
  estoque_destino?: string;
  terceiro?: string;
  maquina?: string;
  produtos: Record<number, string>;
};

export type StatusOperacao = 'PENDENTE' | 'ENVIADO' | 'ERRO' | 'RECUSADO';

export type ControleOperacao = {
  /** A ordem de criação. Não vem do relógio, que pode ser mudado no aparelho. */
  seq: number;
  client_id: string;
  status: StatusOperacao;
  tentativas: number;
  mensagem: string | null;
  id_servidor: number | null;
  criado_em: string;
  enviado_em: string | null;
  proxima_tentativa_em: string | null;
};

export type OperacaoResponsavel = ControleOperacao & {
  tipo: 'RESPONSAVEL_CRIAR';
  nome: string;
};

export type OperacaoLancamento = ControleOperacao & {
  tipo: 'LANCAMENTO_CRIAR';
  dados: DadosLancamento;
  nomes: NomesLancamento;
};

export type OperacaoLocal = OperacaoResponsavel | OperacaoLancamento;
