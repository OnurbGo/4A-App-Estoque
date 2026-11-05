import { create } from 'zustand';
import type { FalhaDeEnvio } from '@/regras/indicador';
import type { ApiError } from '@/services/errors';

type EnvioState = {
  /** O aparelho está numa rede. */
  conectado: boolean;
  /** Por que a última rodada não terminou. Só some numa rodada que deu certo. */
  ultimaFalha: FalhaDeEnvio | null;
  /** Muda a cada rodada, para as telas relerem o banco. */
  rodada: number;
  definirConectado: (conectado: boolean) => void;
  registrarRodada: (falha: Pick<ApiError, 'statusCode' | 'message'> | null) => void;
  avisarMudanca: () => void;
};

export const useEnvioStore = create<EnvioState>((set) => ({
  conectado: true,
  ultimaFalha: null,
  rodada: 0,
  definirConectado: (conectado) => set({ conectado }),
  registrarRodada: (falha) =>
    set(({ rodada }) => ({
      ultimaFalha: falha && { statusCode: falha.statusCode, mensagem: falha.message },
      rodada: rodada + 1,
    })),
  avisarMudanca: () => set(({ rodada }) => ({ rodada: rodada + 1 })),
}));

/** Numa rede sem o servidor, o Wi-Fi sozinho engana: quem confirma é a última rodada. */
export function chegaAoServidor({ conectado, ultimaFalha }: EnvioState): boolean {
  return conectado && ultimaFalha?.statusCode !== 0;
}
