import { useEffect } from 'react';
import { definirAoEncerrarSessao } from '@/services/api-client';
import { useSessionStore } from '@/stores/session-store';

export function useSessionBootstrap(): boolean {
  const pronto = useSessionStore((estado) => estado.pronto);

  useEffect(() => {
    const { iniciar, sessaoEncerrada } = useSessionStore.getState();
    definirAoEncerrarSessao(sessaoEncerrada);
    void iniciar();
    return () => definirAoEncerrarSessao(null);
  }, []);

  return pronto;
}
