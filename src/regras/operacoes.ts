import type { DadosLancamento, NomesLancamento, OperacaoLocal } from './tipos';

export type NovaOperacao =
  | { tipo: 'RESPONSAVEL_CRIAR'; client_id: string; nome: string }
  | {
      tipo: 'LANCAMENTO_CRIAR';
      client_id: string;
      dados: DadosLancamento;
      nomes: NomesLancamento;
    };

export type CorpoOperacao =
  | { tipo: 'RESPONSAVEL_CRIAR'; client_id: string; nome: string }
  | { tipo: 'LANCAMENTO_CRIAR'; client_id: string; dados: DadosLancamento };

const CAMPOS_DADOS = [
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
] as const satisfies readonly Exclude<keyof DadosLancamento, 'itens'>[];

const arredondarQuantidade = (valor: number) => Math.round(valor * 1000) / 1000;

/**
 * Só o que o servidor aceita: ele recusa qualquer campo a mais, e recusa o responsável por id e
 * por client_id juntos. Os nomes gravados no aparelho nunca entram aqui.
 */
function dadosParaEnvio(dados: DadosLancamento): DadosLancamento {
  const campos: Record<string, unknown> = {};
  for (const campo of CAMPOS_DADOS) {
    if (dados[campo] !== undefined && dados[campo] !== null) campos[campo] = dados[campo];
  }
  if (campos.responsavel_client_id !== undefined) delete campos.responsavel_id;

  return {
    ...(campos as Omit<DadosLancamento, 'itens'>),
    itens: dados.itens.map(({ produto_id, quantidade }) => ({
      produto_id,
      quantidade: arredondarQuantidade(quantidade),
    })),
  };
}

export function corpoDaOperacao(operacao: OperacaoLocal): CorpoOperacao {
  if (operacao.tipo === 'RESPONSAVEL_CRIAR') {
    const { tipo, client_id, nome } = operacao;
    return { tipo, client_id, nome };
  }

  const { tipo, client_id, dados } = operacao;
  return { tipo, client_id, dados: dadosParaEnvio(dados) };
}
