const MINUTO_MS = 60_000;

/** 1, 2, 5 e 10 min entre tentativas; depois disso, fica em 10 min. */
export const ESPERAS_MS = [1, 2, 5, 10].map((minutos) => minutos * MINUTO_MS);

export const INTERVALO_COM_PENDENCIA_MS = 2 * MINUTO_MS;
export const INTERVALO_BOOTSTRAP_MS = 15 * MINUTO_MS;

export function esperaDepoisDe(falhas: number): number {
  const posicao = Math.min(Math.max(falhas, 1), ESPERAS_MS.length) - 1;
  return ESPERAS_MS[posicao]!;
}

export function proximaTentativaEm(falhas: number, agora: Date): string {
  return new Date(agora.getTime() + esperaDepoisDe(falhas)).toISOString();
}

export type Gatilho = 'ABRIR' | 'CONEXAO_VOLTOU' | 'LANCAMENTO' | 'TIMER';

/** Ao abrir e quando a conexão volta, o motivo da espera pode ter acabado: tenta na hora. */
export function zeraEspera(gatilho: Gatilho): boolean {
  return gatilho === 'ABRIR' || gatilho === 'CONEXAO_VOLTOU';
}

export type EsperaGeral = { falhas_seguidas: number; proxima_tentativa_em: string | null };

export const SEM_ESPERA: EsperaGeral = { falhas_seguidas: 0, proxima_tentativa_em: null };

export function registrarFalhaGeral(espera: EsperaGeral, agora: Date): EsperaGeral {
  const falhas_seguidas = espera.falhas_seguidas + 1;
  return { falhas_seguidas, proxima_tentativa_em: proximaTentativaEm(falhas_seguidas, agora) };
}

export function podeEnviar(
  gatilho: Gatilho,
  espera: EsperaGeral,
  conectado: boolean,
  agora: Date,
): boolean {
  if (!conectado) return false;
  if (zeraEspera(gatilho) || !espera.proxima_tentativa_em) return true;
  return Date.parse(espera.proxima_tentativa_em) <= agora.getTime();
}

export function bootstrapVencido(iniciadoEm: string | null, agora: Date): boolean {
  if (!iniciadoEm) return true;
  return agora.getTime() - Date.parse(iniciadoEm) >= INTERVALO_BOOTSTRAP_MS;
}
