import type { ResumoPendencias } from './pendencias';

export type EstadoIndicador = 'TUDO_ENVIADO' | 'AGUARDANDO' | 'SEM_CONEXAO';

export type Indicador = {
  estado: EstadoIndicador;
  texto: string;
  /** Presas e recusadas continuam visíveis mesmo sem nada para enviar. */
  atencao: string | null;
};

export function indicadorDeEnvio(
  { aguardando, atencao }: ResumoPendencias,
  conectado: boolean,
): Indicador {
  const avisoDeAtencao =
    atencao === 0 ? null : `${atencao} ${atencao === 1 ? 'precisa' : 'precisam'} de atenção`;

  if (!conectado) {
    return { estado: 'SEM_CONEXAO', texto: 'Sem conexão', atencao: avisoDeAtencao };
  }
  if (aguardando > 0) {
    return {
      estado: 'AGUARDANDO',
      texto: `${aguardando} aguardando envio`,
      atencao: avisoDeAtencao,
    };
  }
  return { estado: 'TUDO_ENVIADO', texto: 'Tudo enviado', atencao: avisoDeAtencao };
}
