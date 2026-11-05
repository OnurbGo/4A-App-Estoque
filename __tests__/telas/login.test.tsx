import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Login from '@/app/(auth)/login';
import { definirEndereco } from '@/services/api-client';
import { useSessionStore } from '@/stores/session-store';
import { repositorioEmMemoria } from '../banco/sqljs';
import { servidorFalso } from '../services/servidor-falso';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');
const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado;

beforeEach(async () => {
  guardado.clear();
  mockPush.mockClear();
  definirEndereco('192.168.0.10');
  const { repositorio } = await repositorioEmMemoria();
  banco.obterRepositorio.mockResolvedValue(repositorio);
  useSessionStore.setState({ autenticado: false, aviso: null, email: null });
});

async function preencher(email: string, senha: string) {
  await fireEvent.changeText(screen.getByTestId('login-email'), email);
  await fireEvent.changeText(screen.getByTestId('login-senha'), senha);
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Login', () => {
  it('entra com e-mail e senha', async () => {
    servidorFalso(() => ({
      status: 201,
      data: { token: 't', usuario: { conta_id: 1, nome: 'Tablets', email: 'a@b.co' } },
    }));
    await render(<Login />);

    await preencher('a@b.co', 'segredo');

    await waitFor(() => expect(useSessionStore.getState().autenticado).toBe(true));
  });

  it('mostra o erro do servidor', async () => {
    servidorFalso(() => ({ status: 401, data: { message: 'E-mail ou senha inválidos.' } }));
    await render(<Login />);

    await preencher('a@b.co', 'errada');

    expect(await screen.findByTestId('login-erro')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('sem endereço salvo, explica onde informar', async () => {
    definirEndereco(null);
    await render(<Login />);

    await preencher('a@b.co', 'segredo');

    expect(await screen.findByTestId('login-erro')).toHaveTextContent(/Opções avançadas/);
  });

  it('não envia sem os campos', async () => {
    const { pedidos } = servidorFalso(() => ({ status: 201 }));
    await render(<Login />);

    await preencher('', '');

    expect(await screen.findByText('Informe a senha.')).toBeTruthy();
    expect(pedidos).toEqual([]);
  });

  it('abre as Opções avançadas', async () => {
    await render(<Login />);

    await fireEvent.press(screen.getByRole('button', { name: 'Opções avançadas' }));

    expect(mockPush).toHaveBeenCalledWith('/opcoes-avancadas');
  });

  it('avisa quando a senha da conta mudou e já traz o e-mail', async () => {
    useSessionStore.setState({
      aviso: 'A senha da conta mudou. Entre de novo.',
      email: 'tablets@example.com',
    });

    await render(<Login />);

    expect(screen.getByText('A senha da conta mudou. Entre de novo.')).toBeTruthy();
    expect(screen.getByTestId('login-email').props.value).toBe('tablets@example.com');
  });
});
