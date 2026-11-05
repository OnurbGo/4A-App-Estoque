import * as SecureStore from 'expo-secure-store';
import type { Repositorio } from '@/banco';
import { definirEndereco } from '@/services/api-client';
import { lerEmail, lerToken, salvarCredenciais } from '@/services/token-storage';
import { useSessionStore } from '@/stores/session-store';
import { repositorioEmMemoria } from '../banco/sqljs';
import { servidorFalso } from './servidor-falso';

jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');
const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado;

const respostaLogin = {
  status: 201,
  data: {
    token: 'token',
    usuario: { conta_id: 9, nome: 'Tablets', email: 'tablets@example.com' },
  },
};

const novaOperacao = {
  tipo: 'RESPONSAVEL_CRIAR' as const,
  client_id: 'operacao-1',
  nome: 'Ana',
};

let repositorio: Repositorio;

beforeEach(async () => {
  guardado.clear();
  ({ repositorio } = await repositorioEmMemoria());
  banco.obterRepositorio.mockReset();
  banco.obterRepositorio.mockResolvedValue(repositorio);
  definirEndereco(null);
  useSessionStore.setState({
    pronto: false,
    autenticado: false,
    email: null,
    aviso: null,
    falhaAoIniciar: null,
  });
});

const estado = () => useSessionStore.getState();

describe('ao abrir o app', () => {
  it('sem credenciais, vai para o login', async () => {
    await estado().iniciar();

    expect(estado()).toMatchObject({ pronto: true, autenticado: false });
  });

  it('com credenciais, entra sem tocar na rede: o tablet abre offline', async () => {
    const { pedidos } = servidorFalso(() => 'SEM_REDE');
    await salvarCredenciais({ email: 'a@b.c', senha: 'segredo', token: 'token' });

    await estado().iniciar();

    expect(estado()).toMatchObject({ pronto: true, autenticado: true, email: 'a@b.c' });
    expect(pedidos).toEqual([]);
  });

  it('aponta para o endereço salvo no aparelho', async () => {
    const { pedidos } = servidorFalso(() => respostaLogin);
    await repositorio.salvarConfig({ endereco: '10.0.0.9:8080', estoque_padrao_id: null });

    await estado().iniciar();
    await estado().entrar('a@b.c', 'segredo');

    expect(pedidos[0]?.baseURL).toBe('http://10.0.0.9:8080/api');
  });

  it('senha sem token volta para o login', async () => {
    await salvarCredenciais({ email: 'a@b.c', senha: 'segredo', token: '' });

    await estado().iniciar();

    expect(estado().autenticado).toBe(false);
  });

  it('mostra a falha se o banco não abrir', async () => {
    banco.obterRepositorio.mockRejectedValue(new Error('Disco cheio'));

    await estado().iniciar();

    expect(estado().pronto).toBe(true);
    expect(estado().falhaAoIniciar).toBeTruthy();
  });
});

describe('entrar', () => {
  beforeEach(() => {
    definirEndereco('192.168.0.10');
  });

  it('guarda as credenciais no aparelho e a sessão sem segredo', async () => {
    servidorFalso(() => respostaLogin);

    await estado().entrar('tablets@example.com', 'segredo');

    expect(estado()).toMatchObject({ autenticado: true, email: 'tablets@example.com' });
    expect(await lerToken()).toBe('token');
    expect(await repositorio.lerSessao()).toMatchObject({
      conta_id: 9,
      nome: 'Tablets',
      email: 'tablets@example.com',
    });
  });

  it('senha errada não guarda nada', async () => {
    servidorFalso(() => ({ status: 401, data: { message: 'E-mail ou senha inválidos.' } }));

    await expect(estado().entrar('a@b.c', 'errada')).rejects.toMatchObject({
      message: 'E-mail ou senha inválidos.',
    });

    expect(estado().autenticado).toBe(false);
    expect(await lerToken()).toBeNull();
  });

  it('entrar limpa o aviso anterior', async () => {
    servidorFalso(() => respostaLogin);
    useSessionStore.setState({ aviso: 'A senha da conta mudou. Entre de novo.' });

    await estado().entrar('a@b.c', 'segredo');

    expect(estado().aviso).toBeNull();
  });
});

describe('sair e entrar de novo', () => {
  beforeEach(async () => {
    definirEndereco('192.168.0.10');
    await salvarCredenciais({ email: 'a@b.c', senha: 'segredo', token: 'token' });
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 3 });
    await repositorio.salvarSessao({
      conta_id: 9,
      nome: 'Tablets',
      email: 'a@b.c',
      entrou_em: '2026-11-05T12:00:00.000Z',
    });
    await repositorio.enfileirar(novaOperacao, '2026-11-05T12:00:00.000Z');
    useSessionStore.setState({ autenticado: true });
  });

  it('sair não apaga endereço, estoque padrão nem a fila', async () => {
    await estado().sair();

    expect(estado().autenticado).toBe(false);
    expect(await lerToken()).toBeNull();
    expect(await repositorio.lerSessao()).toBeNull();
    expect(await repositorio.lerConfig()).toEqual({
      endereco: '192.168.0.10',
      estoque_padrao_id: 3,
    });
    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
  });

  it('senha mudada volta para o login com aviso, sem perder a fila', async () => {
    estado().sessaoEncerrada();
    await Promise.resolve();

    expect(estado()).toMatchObject({
      autenticado: false,
      aviso: 'A senha da conta mudou. Entre de novo.',
    });
    expect(await lerEmail()).toBe('a@b.c');
    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
    expect((await repositorio.lerConfig()).endereco).toBe('192.168.0.10');
  });
});
