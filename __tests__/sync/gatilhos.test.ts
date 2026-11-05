import NetInfo from '@react-native-community/netinfo';
import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { estaConectado, useSincronizacao } from '@/hooks/useSincronizacao';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';

jest.mock('@/sync', () => ({ dispararEnvio: jest.fn(async () => undefined) }));

const disparar = jest.mocked(dispararEnvio);

type OuvinteRede = (estado: { isConnected: boolean | null }) => void;

let ouvirRede: OuvinteRede;
let ouvirApp: (estado: string) => void;
let pararRede: jest.Mock;
let pararApp: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  disparar.mockClear();
  useEnvioStore.setState({ conectado: true });

  pararRede = jest.fn();
  pararApp = jest.fn();
  jest.spyOn(NetInfo, 'addEventListener').mockImplementation((ouvinte) => {
    ouvirRede = ouvinte as unknown as OuvinteRede;
    return pararRede;
  });
  jest.spyOn(NetInfo, 'fetch').mockResolvedValue({ isConnected: true } as never);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_tipo, ouvinte) => {
    ouvirApp = ouvinte as (estado: string) => void;
    return { remove: pararApp } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('estaConectado', () => {
  it('rede local sem internet conta como conectado', () => {
    expect(estaConectado({ isConnected: true })).toBe(true);
  });

  it('sem saber ainda, tenta: o envio é que confirma', () => {
    expect(estaConectado({ isConnected: null })).toBe(true);
  });

  it('fora de qualquer rede, não', () => {
    expect(estaConectado({ isConnected: false })).toBe(false);
  });
});

describe('useSincronizacao', () => {
  const montar = async () => {
    const hook = await renderHook(() => useSincronizacao());
    await jest.advanceTimersByTimeAsync(0);
    disparar.mockClear();
    return hook;
  };

  it('dispara ao abrir', async () => {
    await renderHook(() => useSincronizacao());
    await jest.advanceTimersByTimeAsync(0);

    expect(disparar).toHaveBeenCalledWith('ABRIR');
  });

  it('nunca testa a internet: a rede da fazenda pode não ter', async () => {
    const configurar = jest.spyOn(NetInfo, 'configure');

    await montar();

    const [opcoes] = configurar.mock.calls[0] as [{ reachabilityShouldRun: () => boolean }];
    expect(opcoes.reachabilityShouldRun()).toBe(false);
  });

  it('dispara quando a conexão volta, e só quando volta', async () => {
    await montar();

    ouvirRede({ isConnected: true });
    expect(disparar).not.toHaveBeenCalled();

    ouvirRede({ isConnected: false });
    expect(useEnvioStore.getState().conectado).toBe(false);
    expect(disparar).not.toHaveBeenCalled();

    ouvirRede({ isConnected: true });
    expect(useEnvioStore.getState().conectado).toBe(true);
    expect(disparar).toHaveBeenCalledTimes(1);
    expect(disparar).toHaveBeenCalledWith('CONEXAO_VOLTOU');
  });

  it('dispara a cada 2 min', async () => {
    await montar();

    await jest.advanceTimersByTimeAsync(119_000);
    expect(disparar).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(disparar).toHaveBeenCalledWith('TIMER');

    await jest.advanceTimersByTimeAsync(120_000);
    expect(disparar).toHaveBeenCalledTimes(2);
  });

  it('dispara ao voltar para o app, não ao sair', async () => {
    await montar();

    ouvirApp('background');
    expect(disparar).not.toHaveBeenCalled();

    ouvirApp('active');
    expect(disparar).toHaveBeenCalledWith('ABRIR');
  });

  it('para tudo ao sair da tela', async () => {
    const { unmount } = await montar();

    await unmount();
    await jest.advanceTimersByTimeAsync(600_000);

    expect(pararRede).toHaveBeenCalled();
    expect(pararApp).toHaveBeenCalled();
    expect(disparar).not.toHaveBeenCalled();
  });
});
