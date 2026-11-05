import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import Configuracoes from '@/app/(app)/configuracoes';
import type { Repositorio } from '@/banco';
import { TelaConfiguracoes } from '@/features/configuracoes/TelaConfiguracoes';
import { definirEndereco } from '@/services/api-client';
import { lerToken, salvarCredenciais } from '@/services/token-storage';
import { useSessionStore } from '@/stores/session-store';
import { repositorioEmMemoria } from '../banco/sqljs';
import { servidorFalso } from '../services/servidor-falso';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));
jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');
const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado;

const ESTOQUES = [
  { id_almox_estoque: 1, nome: 'Casinha de defensivos', grupo: 'INSUMOS' },
  { id_almox_estoque: 4, nome: 'Caminhão de combustível', grupo: 'COMBUSTIVEL' },
];

const BOOTSTRAP = {
  estoques: ESTOQUES as never,
  produtos: [],
  produtos_por_estoque: [],
  responsaveis: [],
  terceiros: [],
  maquinas: [],
  motivos: {},
};

let repositorio: Repositorio;
const aoTerminar = jest.fn();

beforeEach(async () => {
  guardado.clear();
  mockBack.mockClear();
  aoTerminar.mockClear();
  definirEndereco(null);
  ({ repositorio } = await repositorioEmMemoria());
  banco.obterRepositorio.mockResolvedValue(repositorio);
  useSessionStore.setState({ autenticado: true, aviso: null, email: null });
});

async function abrirTela() {
  await render(<TelaConfiguracoes titulo="Opções avançadas" aoTerminar={aoTerminar} />);
  return screen.findByTestId('config-endereco');
}

describe('endereço e teste de conexão', () => {
  it('não vem com endereço nenhum: nada aponta para um servidor', async () => {
    const campo = await abrirTela();

    expect(campo.props.value).toBe('');
  });

  it('testar conexão lista os estoques da rota sem login, mais a opção Nenhum', async () => {
    const { pedidos } = servidorFalso(() => ({ status: 200, data: ESTOQUES }));
    const campo = await abrirTela();

    await fireEvent.changeText(campo, '192.168.0.10');
    await fireEvent.press(screen.getByRole('button', { name: 'Testar conexão' }));

    expect(await screen.findByRole('radio', { name: 'Casinha de defensivos' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Caminhão de combustível' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Nenhum' })).toBeTruthy();
    expect(screen.getByTestId('config-teste')).toHaveTextContent(/2 estoques/);
    expect(pedidos[0]).toMatchObject({
      baseURL: 'http://192.168.0.10/api',
      url: '/almoxarifado/tablet/estoques',
    });
  });

  it('mostra quando a conexão falha', async () => {
    servidorFalso(() => 'SEM_REDE');
    const campo = await abrirTela();

    await fireEvent.changeText(campo, '192.168.0.10');
    await fireEvent.press(screen.getByRole('button', { name: 'Testar conexão' }));

    expect(await screen.findByTestId('config-teste')).toHaveTextContent(/Sem conexão/);
  });

  it('recusa endereço inválido antes de tentar', async () => {
    const { pedidos } = servidorFalso(() => ({ status: 200, data: [] }));
    const campo = await abrirTela();

    await fireEvent.changeText(campo, '192.168');
    await fireEvent.press(screen.getByRole('button', { name: 'Testar conexão' }));

    expect(await screen.findByText(/Confira o endereço/)).toBeTruthy();
    expect(pedidos).toEqual([]);
  });

  it('sem conexão, oferece os estoques do último bootstrap', async () => {
    await repositorio.salvarBootstrap(BOOTSTRAP, '2026-11-05T12:00:00.000Z');

    await abrirTela();

    expect(screen.getByRole('radio', { name: 'Casinha de defensivos' })).toBeTruthy();
  });
});

describe('salvar', () => {
  it('guarda o endereço normalizado e o estoque padrão', async () => {
    await repositorio.salvarBootstrap(BOOTSTRAP, '2026-11-05T12:00:00.000Z');
    const campo = await abrirTela();

    await fireEvent.changeText(campo, 'http://192.168.0.10:8080/');
    await fireEvent.press(screen.getByRole('radio', { name: 'Caminhão de combustível' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(await repositorio.lerConfig()).toEqual({
      endereco: '192.168.0.10:8080',
      estoque_padrao_id: 4,
    });
  });

  it('marca o estoque padrão salvo e aceita voltar para Nenhum', async () => {
    await repositorio.salvarBootstrap(BOOTSTRAP, '2026-11-05T12:00:00.000Z');
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 1 });
    await abrirTela();

    expect(screen.getByRole('radio', { name: 'Casinha de defensivos' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: 'Nenhum' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect((await repositorio.lerConfig()).estoque_padrao_id).toBeNull();
  });

  it('não salva endereço inválido', async () => {
    const campo = await abrirTela();

    await fireEvent.changeText(campo, 'abc def');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Confira o endereço/)).toBeTruthy();
    expect(aoTerminar).not.toHaveBeenCalled();
  });

  it('trocar o estoque padrão com pendências é permitido, sem aviso', async () => {
    const alerta = jest.spyOn(Alert, 'alert');
    await repositorio.salvarBootstrap(BOOTSTRAP, '2026-11-05T12:00:00.000Z');
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 1 });
    await repositorio.enfileirar(
      { tipo: 'RESPONSAVEL_CRIAR', client_id: 'a', nome: 'Ana' },
      '2026-11-05T12:00:00.000Z',
    );
    await abrirTela();

    await fireEvent.press(screen.getByRole('radio', { name: 'Caminhão de combustível' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(alerta).not.toHaveBeenCalled();
    expect(await repositorio.lerBootstrap()).not.toBeNull();
    alerta.mockRestore();
  });

  describe('trocando o servidor com envios pendentes', () => {
    beforeEach(async () => {
      await repositorio.salvarBootstrap(BOOTSTRAP, '2026-11-05T12:00:00.000Z');
      await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 1 });
      await repositorio.enfileirar(
        { tipo: 'RESPONSAVEL_CRIAR', client_id: 'a', nome: 'Ana' },
        '2026-11-05T12:00:00.000Z',
      );
    });

    async function tocarSalvar(botao: 'Voltar' | 'Trocar') {
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation((_titulo, _texto, botoes) => {
        botoes?.find(({ text }) => text === botao)?.onPress?.();
      });
      const campo = await abrirTela();

      await fireEvent.changeText(campo, '10.0.0.9');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(alerta).toHaveBeenCalled());
      return alerta;
    }

    it('avisa e, ao trocar, limpa o bootstrap do servidor anterior', async () => {
      const alerta = await tocarSalvar('Trocar');

      expect(alerta.mock.calls[0]?.[1]).toBe('1 envio pendente irá para o novo servidor.');
      await waitFor(() => expect(aoTerminar).toHaveBeenCalled());
      expect((await repositorio.lerConfig()).endereco).toBe('10.0.0.9');
      expect(await repositorio.lerBootstrap()).toBeNull();
      expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
      alerta.mockRestore();
    });

    it('ao voltar, nada muda', async () => {
      const alerta = await tocarSalvar('Voltar');

      await waitFor(async () =>
        expect((await repositorio.lerConfig()).endereco).toBe('192.168.0.10'),
      );
      expect(aoTerminar).not.toHaveBeenCalled();
      expect(await repositorio.lerBootstrap()).not.toBeNull();
      alerta.mockRestore();
    });
  });
});

describe('Configurações depois de entrar', () => {
  beforeEach(async () => {
    await salvarCredenciais({ email: 'a@b.co', senha: 'segredo', token: 'token' });
  });

  it('pede a senha da conta para abrir, sem usar a rede', async () => {
    const { pedidos } = servidorFalso(() => 'SEM_REDE');
    await render(<Configuracoes />);

    expect(screen.queryByTestId('config-endereco')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('config-senha'), 'segredo');
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));

    expect(await screen.findByTestId('config-endereco')).toBeTruthy();
    expect(pedidos).toEqual([]);
  });

  it('senha errada não abre', async () => {
    await render(<Configuracoes />);

    await fireEvent.changeText(screen.getByTestId('config-senha'), 'errada');
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));

    expect(await screen.findByText('Senha incorreta.')).toBeTruthy();
    expect(screen.queryByTestId('config-endereco')).toBeNull();
  });

  it('sair da conta guarda endereço, estoque padrão e fila', async () => {
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 1 });
    await repositorio.enfileirar(
      { tipo: 'RESPONSAVEL_CRIAR', client_id: 'a', nome: 'Ana' },
      '2026-11-05T12:00:00.000Z',
    );
    await render(<Configuracoes />);
    await fireEvent.changeText(screen.getByTestId('config-senha'), 'segredo');
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));
    await screen.findByTestId('config-endereco');

    await fireEvent.press(screen.getByRole('button', { name: 'Sair da conta' }));

    await waitFor(() => expect(useSessionStore.getState().autenticado).toBe(false));
    expect(await lerToken()).toBeNull();
    expect(await repositorio.lerConfig()).toEqual({
      endereco: '192.168.0.10',
      estoque_padrao_id: 1,
    });
    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
  });
});
