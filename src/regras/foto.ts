export const LADO_MAIOR_PX = 1600;
export const QUALIDADE_JPEG = 0.7;
export const FOTOS_POR_LANCAMENTO = 10;

export type Redimensionamento = { width: number } | { height: number };

/** Só reduz: uma foto menor que o limite não ganha pixels à toa. */
export function redimensionamento(largura: number, altura: number): Redimensionamento | null {
  if (Math.max(largura, altura) <= LADO_MAIOR_PX) return null;
  return largura >= altura ? { width: LADO_MAIOR_PX } : { height: LADO_MAIOR_PX };
}

export function podeAdicionarFoto(quantidade: number): boolean {
  return quantidade < FOTOS_POR_LANCAMENTO;
}
