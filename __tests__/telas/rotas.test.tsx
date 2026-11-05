import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { definirEndereco } from '@/services/api-client';
import { salvarCredenciais } from '@/services/token-storage';
import { useSessionStore } from '@/stores/session-store';
import { repositorioEmMemoria } from '../banco/sqljs';
import { servidorFalso } from '../services/servidor-falso';

jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));
jest.mock('@/sync', () => ({ dispararEnvio: jest.fn(async () => undefined) }));
jest.mock('@expo-google-fonts/dm-sans', () => ({
  DMSans_400Regular: 'DMSans_400Regular',
  DMSans_500Medium: 'DMSans_500Medium',
  DMSans_700Bold: 'DMSans_700Bold',
  useFonts: () => [true, null],
}));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');
const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado;

beforeEach(async () => {
  guardado.clear();
  definirEndereco(null);
  const { repositorio } = await repositorioEmMemoria();
  banco.obterRepositorio.mockResolvedValue(repositorio);
  useSessionStore.setState({
    pronto: false,
    autenticado: false,
    email: null,
    aviso: null,
    falhaAoIniciar: null,
  });
  servidorFalso(() => 'SEM_REDE');
});

describe('rotas protegidas', () => {
  it('sem conta, abre no login', async () => {
    await renderRouter('src/app', { initialUrl: '/' });

    await waitFor(() => expect(screen).toHavePathname('/login'));
    expect(screen.getByTestId('login-entrar')).toBeTruthy();
  });

  it('com credenciais salvas e sem rede, abre no início', async () => {
    await salvarCredenciais({ email: 'a@b.co', senha: 'segredo', token: 'token' });

    await renderRouter('src/app', { initialUrl: '/' });

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(await screen.findByTestId('inicio-configuracoes')).toBeTruthy();
  });

  it('sem conta, as Configurações não abrem', async () => {
    await renderRouter('src/app', { initialUrl: '/configuracoes' });

    await waitFor(() => expect(screen).toHavePathname('/login'));
  });

  it('quando a sessão acaba, volta para o login', async () => {
    await salvarCredenciais({ email: 'a@b.co', senha: 'segredo', token: 'token' });
    await renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('inicio-configuracoes');

    await act(async () => {
      useSessionStore.getState().sessaoEncerrada();
    });

    await waitFor(() => expect(screen).toHavePathname('/login'));
    expect(screen.getByText('A senha da conta mudou. Entre de novo.')).toBeTruthy();
  });

  it('as Opções avançadas abrem antes de entrar', async () => {
    await renderRouter('src/app', { initialUrl: '/opcoes-avancadas' });

    await waitFor(() => expect(screen).toHavePathname('/opcoes-avancadas'));
    expect(await screen.findByTestId('config-endereco')).toBeTruthy();
  });
});
