/**
 * Provisória: a A.10 precisa testar a fila no tablet antes de as telas da A.11 existirem. Só o
 * perfil EAS `teste` liga esta tela. Sai na A.11.
 */
export function telaDeTesteLigada(): boolean {
  return process.env.EXPO_PUBLIC_TELA_TESTE === '1';
}
