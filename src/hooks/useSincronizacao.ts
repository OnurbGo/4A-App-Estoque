import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { INTERVALO_COM_PENDENCIA_MS } from '@/regras/agendamento';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';

/**
 * Só `isConnected`: o `isInternetReachable` testa a internet e diria "Sem conexão" numa rede local
 * sem internet, com o servidor acessível. Quem confirma o servidor é o envio de verdade.
 */
export function estaConectado({ isConnected }: Pick<NetInfoState, 'isConnected'>): boolean {
  return isConnected !== false;
}

/** Dispara ao abrir, quando a conexão volta, a cada 2 min e ao voltar para o app. */
export function useSincronizacao(): void {
  useEffect(() => {
    const { definirConectado } = useEnvioStore.getState();

    NetInfo.configure({ reachabilityShouldRun: () => false });

    const pararDeOuvirRede = NetInfo.addEventListener((estado) => {
      const antes = useEnvioStore.getState().conectado;
      const agora = estaConectado(estado);
      definirConectado(agora);
      if (agora && !antes) void dispararEnvio('CONEXAO_VOLTOU');
    });

    void NetInfo.fetch().then((estado) => {
      definirConectado(estaConectado(estado));
      void dispararEnvio('ABRIR');
    });

    const relogio = setInterval(() => void dispararEnvio('TIMER'), INTERVALO_COM_PENDENCIA_MS);

    const pararDeOuvirApp = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void dispararEnvio('ABRIR');
    });

    return () => {
      pararDeOuvirRede();
      clearInterval(relogio);
      pararDeOuvirApp.remove();
    };
  }, []);
}
