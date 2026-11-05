import type { AnexoPendente } from './fila';
import type {
  LancamentoTipo,
  OperacaoLancamento,
  OperacaoLocal,
  OperacaoResponsavel,
} from './tipos';

/** A partir daqui, uma operação em `ERRO` é tratada como presa. */
export const TENTATIVAS_PARA_PRESA = 3;

export type SituacaoPendencia = 'RECUSADA' | 'PRESA' | 'AGUARDANDO';

export type ItemPendencia = {
  id: string;
  situacao: SituacaoPendencia;
  titulo: string;
  detalhe: string;
  /** O que o servidor disse. */
  mensagem: string | null;
  /** O que a pessoa no tablet precisa saber. */
  orientacao: string | null;
  tentativas: number;
  criado_em: string;
  fotos: number;
};

const NOME_DO_TIPO: Record<LancamentoTipo, string> = {
  SAIDA: 'Saída',
  ENTRADA: 'Entrada',
  MOVIMENTACAO: 'Movimentação',
  APLICACAO: 'Aplicação',
  ABASTECIMENTO: 'Abastecimento',
};

const ORDEM: Record<SituacaoPendencia, number> = { RECUSADA: 0, PRESA: 1, AGUARDANDO: 2 };

const ORIENTACAO_PRESA = 'O envio continua sendo repetido. Se não sair, avise o escritório.';

function detalheDoLancamento({ dados, nomes }: OperacaoLancamento): string {
  const produtos = dados.itens.map(
    ({ produto_id }) => nomes.produtos[produto_id] ?? `Produto ${produto_id}`,
  );
  const estoque = nomes.estoque_destino
    ? `de ${nomes.estoque} para ${nomes.estoque_destino}`
    : nomes.estoque;
  return `${produtos.join(', ')} · ${estoque}`;
}

function itemDoLancamento(
  operacao: OperacaoLancamento,
  responsaveisRecusados: ReadonlyMap<string, OperacaoResponsavel>,
  fotos: number,
): ItemPendencia {
  const { client_id, status, mensagem, tentativas, criado_em, dados, nomes } = operacao;
  const base = {
    id: client_id,
    titulo: `${NOME_DO_TIPO[dados.tipo]} · ${nomes.responsavel}`,
    detalhe: detalheDoLancamento(operacao),
    mensagem,
    tentativas,
    criado_em,
    fotos,
  };

  if (status === 'RECUSADO') {
    return {
      ...base,
      situacao: 'RECUSADA',
      orientacao: 'Não foi registrado. Peça para refazer no sistema, em Baixa manual.',
    };
  }

  const responsavelRecusado = dados.responsavel_client_id
    ? responsaveisRecusados.get(dados.responsavel_client_id)
    : undefined;
  if (responsavelRecusado) {
    return {
      ...base,
      situacao: 'PRESA',
      mensagem: responsavelRecusado.mensagem,
      orientacao: `O cadastro de ${responsavelRecusado.nome} foi recusado, então este lançamento fica aguardando. Avise o escritório.`,
    };
  }

  if (status === 'ERRO' && tentativas >= TENTATIVAS_PARA_PRESA) {
    return { ...base, situacao: 'PRESA', orientacao: ORIENTACAO_PRESA };
  }

  return { ...base, situacao: 'AGUARDANDO', orientacao: null };
}

function itemDoResponsavel(operacao: OperacaoResponsavel): ItemPendencia {
  const { client_id, status, nome, mensagem, tentativas, criado_em } = operacao;
  const base = {
    id: client_id,
    titulo: `Cadastro de ${nome}`,
    detalhe: 'Novo responsável',
    mensagem,
    tentativas,
    criado_em,
    fotos: 0,
  };

  if (status === 'RECUSADO') {
    return { ...base, situacao: 'RECUSADA', orientacao: 'Confira o nome com o escritório.' };
  }
  if (status === 'ERRO' && tentativas >= TENTATIVAS_PARA_PRESA) {
    return { ...base, situacao: 'PRESA', orientacao: ORIENTACAO_PRESA };
  }
  return { ...base, situacao: 'AGUARDANDO', orientacao: null };
}

function itemDaFoto(anexo: AnexoPendente, lancamento: OperacaoLancamento | undefined): ItemPendencia {
  const recusada = anexo.status === 'RECUSADO';
  return {
    id: anexo.client_id,
    situacao: recusada ? 'RECUSADA' : 'AGUARDANDO',
    titulo: lancamento
      ? `Foto · ${NOME_DO_TIPO[lancamento.dados.tipo]} · ${lancamento.nomes.responsavel}`
      : 'Foto de um lançamento',
    detalhe: lancamento ? detalheDoLancamento(lancamento) : 'Lançamento já enviado',
    mensagem: anexo.mensagem,
    orientacao: recusada ? 'A foto não foi aceita. O lançamento foi registrado sem ela.' : null,
    tentativas: anexo.tentativas,
    criado_em: anexo.criado_em,
    fotos: 0,
  };
}

/**
 * Tudo que ainda não terminou. A foto de um lançamento que não chegou vai junto dele; só vira item
 * próprio depois que o lançamento foi enviado, ou se ela mesma foi recusada.
 */
export function montarPendencias(
  operacoes: readonly OperacaoLocal[],
  anexos: readonly AnexoPendente[],
): ItemPendencia[] {
  const lancamentos = new Map(
    operacoes.flatMap((operacao): [string, OperacaoLancamento][] =>
      operacao.tipo === 'LANCAMENTO_CRIAR' ? [[operacao.client_id, operacao]] : [],
    ),
  );
  const responsaveisRecusados = new Map(
    operacoes.flatMap((operacao): [string, OperacaoResponsavel][] =>
      operacao.tipo === 'RESPONSAVEL_CRIAR' && operacao.status === 'RECUSADO'
        ? [[operacao.client_id, operacao]]
        : [],
    ),
  );

  const fotosPorLancamento = new Map<string, number>();
  const itensDeFoto: ItemPendencia[] = [];
  for (const anexo of anexos) {
    const lancamento = lancamentos.get(anexo.lancamento_client_id);
    if (anexo.status === 'RECUSADO' || !lancamento || lancamento.status === 'ENVIADO') {
      itensDeFoto.push(itemDaFoto(anexo, lancamento));
    } else {
      const total = fotosPorLancamento.get(anexo.lancamento_client_id) ?? 0;
      fotosPorLancamento.set(anexo.lancamento_client_id, total + 1);
    }
  }

  const itensDeOperacao = [...operacoes]
    .sort((a, b) => a.seq - b.seq)
    .filter(({ status }) => status !== 'ENVIADO')
    .map((operacao) =>
      operacao.tipo === 'RESPONSAVEL_CRIAR'
        ? itemDoResponsavel(operacao)
        : itemDoLancamento(
            operacao,
            responsaveisRecusados,
            fotosPorLancamento.get(operacao.client_id) ?? 0,
          ),
    );

  return [...itensDeOperacao, ...itensDeFoto].sort(
    (a, b) => ORDEM[a.situacao] - ORDEM[b.situacao],
  );
}

export type ResumoPendencias = {
  /** Ainda vão ser enviadas, inclusive as presas. */
  aguardando: number;
  /** Presas e recusadas: precisam de alguém olhando. */
  atencao: number;
};

export function resumirPendencias(itens: readonly ItemPendencia[]): ResumoPendencias {
  return {
    aguardando: itens.filter(({ situacao }) => situacao !== 'RECUSADA').length,
    atencao: itens.filter(({ situacao }) => situacao !== 'AGUARDANDO').length,
  };
}
