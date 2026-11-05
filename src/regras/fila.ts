import { proximaTentativaEm } from './agendamento';
import type { ControleOperacao, OperacaoLocal, StatusOperacao } from './tipos';

/** O servidor aceita até 100, mas lotes menores perdem menos trabalho se o Wi-Fi cair. */
export const TAMANHO_LOTE = 50;

export type ResultadoOperacao = {
  client_id: string | null;
  tipo?: string | null;
  status: string;
  mensagem?: string;
  responsavel_id?: number;
  lancamento_id?: number;
};

export type AlteracaoOperacao = Pick<
  ControleOperacao,
  | 'client_id'
  | 'status'
  | 'tentativas'
  | 'mensagem'
  | 'id_servidor'
  | 'enviado_em'
  | 'proxima_tentativa_em'
>;

const NA_FILA: readonly StatusOperacao[] = ['PENDENTE', 'ERRO'];

const SEM_RESPOSTA = 'O servidor não respondeu por esta operação. O envio será repetido.';

function chegouAHora(proximaTentativa: string | null, agora: Date): boolean {
  return !proximaTentativa || Date.parse(proximaTentativa) <= agora.getTime();
}

/**
 * Na ordem de criação, pulando quem ainda espera a própria vez: operações presas no início da
 * fila não podem travar as que vêm depois.
 */
export function escolherLote(
  operacoes: readonly OperacaoLocal[],
  agora: Date,
  tamanho = TAMANHO_LOTE,
): OperacaoLocal[] {
  return operacoes
    .filter(
      ({ status, proxima_tentativa_em }) =>
        NA_FILA.includes(status) && chegouAHora(proxima_tentativa_em, agora),
    )
    .sort((a, b) => a.seq - b.seq)
    .slice(0, tamanho);
}

function voltarParaFila(
  operacao: OperacaoLocal,
  mensagem: string | undefined,
  agora: Date,
): AlteracaoOperacao {
  const tentativas = operacao.tentativas + 1;
  return {
    client_id: operacao.client_id,
    status: 'ERRO',
    tentativas,
    mensagem: mensagem ?? operacao.mensagem,
    id_servidor: operacao.id_servidor,
    enviado_em: null,
    proxima_tentativa_em: proximaTentativaEm(tentativas, agora),
  };
}

function aplicarResultado(
  operacao: OperacaoLocal,
  resultado: ResultadoOperacao | undefined,
  agora: Date,
): AlteracaoOperacao {
  const base = { client_id: operacao.client_id, tentativas: operacao.tentativas + 1 };

  switch (resultado?.status) {
    case 'SINCRONIZADO':
    case 'JA_SINCRONIZADO':
      return {
        ...base,
        status: 'ENVIADO',
        mensagem: null,
        id_servidor: resultado.lancamento_id ?? resultado.responsavel_id ?? null,
        enviado_em: agora.toISOString(),
        proxima_tentativa_em: null,
      };
    case 'RECUSADO':
      return {
        ...base,
        status: 'RECUSADO',
        mensagem: resultado.mensagem ?? 'O servidor recusou esta operação.',
        id_servidor: null,
        enviado_em: null,
        proxima_tentativa_em: null,
      };
    case 'TENTAR_NOVAMENTE':
      return voltarParaFila(operacao, resultado.mensagem, agora);
    default:
      // Sem resposta ou com um status desconhecido, a operação nunca pode se perder.
      return voltarParaFila(operacao, SEM_RESPOSTA, agora);
  }
}

/** Uma alteração por operação do lote, casando pela `client_id`, não pela posição. */
export function aplicarResultados(
  lote: readonly OperacaoLocal[],
  resultados: readonly ResultadoOperacao[],
  agora: Date,
): AlteracaoOperacao[] {
  const porClientId = new Map(resultados.map((resultado) => [resultado.client_id, resultado]));
  return lote.map((operacao) =>
    aplicarResultado(operacao, porClientId.get(operacao.client_id), agora),
  );
}

export type StatusAnexo = 'PENDENTE' | 'RECUSADO';

export type AnexoPendente = {
  client_id: string;
  lancamento_client_id: string;
  caminho: string;
  status: StatusAnexo;
  tentativas: number;
  mensagem: string | null;
  proxima_tentativa_em: string | null;
  criado_em: string;
};

/** Foto só sobe depois do lançamento: antes dele, o servidor nem guardaria o arquivo. */
export function escolherAnexos(
  anexos: readonly AnexoPendente[],
  operacoes: readonly OperacaoLocal[],
  agora: Date,
): AnexoPendente[] {
  const enviados = new Set(
    operacoes.filter(({ status }) => status === 'ENVIADO').map(({ client_id }) => client_id),
  );

  return anexos.filter(
    ({ status, lancamento_client_id, proxima_tentativa_em }) =>
      status === 'PENDENTE' &&
      enviados.has(lancamento_client_id) &&
      chegouAHora(proxima_tentativa_em, agora),
  );
}

export type ResultadoAnexo = 'SINCRONIZADO' | 'JA_SINCRONIZADO' | 'AGUARDANDO_LANCAMENTO';

export type AlteracaoAnexo = Pick<
  AnexoPendente,
  'client_id' | 'status' | 'tentativas' | 'mensagem' | 'proxima_tentativa_em'
>;

/** Devolve `null` quando a foto já está no servidor e sai do aparelho. */
export function aplicarResultadoAnexo(
  anexo: AnexoPendente,
  resultado: ResultadoAnexo,
  agora: Date,
): AlteracaoAnexo | null {
  return resultado === 'AGUARDANDO_LANCAMENTO' ? adiarAnexo(anexo, anexo.mensagem, agora) : null;
}

export type ReacaoAFalhaDaFoto = 'RECUSAR' | 'ADIAR' | 'PARAR';

export function reacaoAFalhaDaFoto(statusHttp: number): ReacaoAFalhaDaFoto {
  // Foto inválida, grande demais ou além do limite de 10: repetir o envio não resolve.
  if (statusHttp === 400 || statusHttp === 413) return 'RECUSAR';
  // Sem rede ou sem acesso, nenhuma outra foto passaria.
  if (statusHttp === 0 || statusHttp === 401 || statusHttp === 403) return 'PARAR';
  // Pode ser só desta foto: as outras e o bootstrap não podem ficar esperando por ela.
  return 'ADIAR';
}

export function adiarAnexo(
  anexo: AnexoPendente,
  mensagem: string | null,
  agora: Date,
): AlteracaoAnexo {
  const tentativas = anexo.tentativas + 1;
  return {
    client_id: anexo.client_id,
    status: 'PENDENTE',
    tentativas,
    mensagem,
    proxima_tentativa_em: proximaTentativaEm(tentativas, agora),
  };
}

export function recusarAnexo(anexo: AnexoPendente, mensagem: string): AlteracaoAnexo {
  return {
    client_id: anexo.client_id,
    status: 'RECUSADO',
    tentativas: anexo.tentativas + 1,
    mensagem,
    proxima_tentativa_em: null,
  };
}
