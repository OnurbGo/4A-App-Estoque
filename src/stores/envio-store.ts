import { create } from 'zustand';

type EnvioState = {
  /** O aparelho está numa rede. */
  conectado: boolean;
  /** A última rodada alcançou o servidor; numa rede sem o servidor, o Wi-Fi sozinho engana. */
  servidorRespondeu: boolean;
  /** Muda a cada rodada, para as telas relerem o banco. */
  rodada: number;
  definirConectado: (conectado: boolean) => void;
  registrarRodada: (servidorRespondeu: boolean) => void;
  avisarMudanca: () => void;
};

export const useEnvioStore = create<EnvioState>((set) => ({
  conectado: true,
  servidorRespondeu: true,
  rodada: 0,
  definirConectado: (conectado) => set({ conectado }),
  registrarRodada: (servidorRespondeu) =>
    set(({ rodada }) => ({ servidorRespondeu, rodada: rodada + 1 })),
  avisarMudanca: () => set(({ rodada }) => ({ rodada: rodada + 1 })),
}));
