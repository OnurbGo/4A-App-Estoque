import type { ResumoPendencias } from './pendencias';

export type EstadoIndicador = 'TUDO_ENVIADO' | 'AGUARDANDO' | 'SEM_CONEXAO';

/** O pedido inteiro falhou, então nenhuma operação guardou o motivo. */
export type FalhaDeEnvio = { statusCode: number; mensagem: string };

export type Indicador = {
  estado: EstadoIndicador;
  texto: string;
  /** Presas e recusadas continuam visíveis mesmo sem nada para enviar. */
  atencao: string | null;
  /** Por que nada está saindo, quando o motivo não é a falta de rede. */
  falha: string | null;
};

/**
 * Sem rede, "Sem conexão" já diz tudo. Nas outras falhas, como conta sem acesso ou endereço de
 * outro serviço, sem o motivo a fila só pareceria lenta.
 */
export function motivoDaFalha(falha: FalhaDeEnvio | null, conectado: boolean): string | null {
  if (!falha || !conectado || falha.statusCode === 0) return null;
  return falha.mensagem;
}

export function indicadorDeEnvio(
  { aguardando, atencao }: ResumoPendencias,
  conectado: boolean,
  falhaGeral: FalhaDeEnvio | null = null,
): Indicador {
  const avisoDeAtencao =
    atencao === 0 ? null : `${atencao} ${atencao === 1 ? 'precisa' : 'precisam'} de atenção`;
  const base = { atencao: avisoDeAtencao, falha: motivoDaFalha(falhaGeral, conectado) };

  if (!conectado) return { ...base, estado: 'SEM_CONEXAO', texto: 'Sem conexão' };
  if (aguardando > 0) {
    return { ...base, estado: 'AGUARDANDO', texto: `${aguardando} aguardando envio` };
  }
  return { ...base, estado: 'TUDO_ENVIADO', texto: 'Tudo enviado' };
}
