const TAMANHO_MAXIMO = 120;
const TAMANHO_DO_SUFIXO = 6;

/** Tablets do mesmo modelo se diferenciam pelo começo do id gerado no aparelho. */
export function nomeDoDispositivo(modelo: string | null | undefined, id: string): string {
  const sufixo = id.replace(/-/g, '').slice(0, TAMANHO_DO_SUFIXO);
  const nome = modelo?.trim() || 'Tablet';
  return `${nome.slice(0, TAMANHO_MAXIMO - TAMANHO_DO_SUFIXO - 1)} ${sufixo}`;
}
