import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import Inicio from '@/app/(app)/index';
import TesteLancamento from '@/app/(app)/teste-lancamento';
import type { Repositorio } from '@/banco';
import type { Bootstrap, OperacaoLancamento } from '@/regras/tipos';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';
import { repositorioEmMemoria } from '../banco/sqljs';

const mockRedirect = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
  };
});
jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));
jest.mock('@/sync', () => ({ dispararEnvio: jest.fn(async () => undefined) }));
jest.mock('@/services/fotos', () => ({
  tirarFoto: jest.fn(async () => ({ uri: 'file:///cache/foto.jpg', largura: 4000, altura: 3000 })),
  guardarFoto: jest.fn(async (_foto: unknown, id: string) => `file:///anexos/${id}.jpg`),
  apagarFoto: jest.fn(),
}));

let proximoId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${(proximoId += 1)}` }));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');

const bootstrap: Bootstrap = {
  estoques: [
    { id_almox_estoque: 1, nome: 'Casinha de defensivos', grupo: 'INSUMOS' },
    { id_almox_estoque: 2, nome: 'Barracão de Adubo', grupo: 'INSUMOS' },
  ],
  produtos: [{ id_almox_produto: 10, nome: 'Verdict Max', unidade: 'L' }],
  produtos_por_estoque: [
    { estoque_id: 2, produtos: [{ produto_id: 10, saldo: 0.5 }], recentes: [10] },
  ],
  responsaveis: [{ id_almox_responsavel: 7, nome: 'Carlos' }],
  terceiros: [],
  maquinas: [],
  motivos: {},
};

let repositorio: Repositorio;

function comQuery(tela: ReactNode) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={cliente}>{tela}</QueryClientProvider>;
}

const lancamentos = async () =>
  (await repositorio.listarOperacoesEmAberto(null)).filter(
    (operacao): operacao is OperacaoLancamento => operacao.tipo === 'LANCAMENTO_CRIAR',
  );

beforeEach(async () => {
  proximoId = 0;
  mockRedirect.mockClear();
  jest.mocked(dispararEnvio).mockClear();
  ({ repositorio } = await repositorioEmMemoria());
  banco.obterRepositorio.mockResolvedValue(repositorio);
  useEnvioStore.setState({ conectado: true, ultimaFalha: null, rodada: 0 });
  process.env.EXPO_PUBLIC_TELA_TESTE = '1';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_TELA_TESTE;
});

describe('com a tela desligada (perfil preview)', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_TELA_TESTE;
  });

  it('a rota volta para o início', async () => {
    await render(comQuery(<TesteLancamento />));

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('o início não mostra o botão', async () => {
    await render(comQuery(<Inicio />));

    await screen.findByTestId('inicio-configuracoes');
    expect(screen.queryByTestId('inicio-teste')).toBeNull();
  });
});

describe('com a tela ligada (perfil teste)', () => {
  beforeEach(async () => {
    await repositorio.salvarBootstrap(bootstrap, '2026-11-05T12:00:00.000Z');
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 2 });
  });

  async function escolher() {
    await render(comQuery(<TesteLancamento />));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Carlos' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Verdict Max' }));
  }

  it('o início mostra o botão', async () => {
    await render(comQuery(<Inicio />));

    expect(await screen.findByTestId('inicio-teste')).toBeTruthy();
  });

  it('sem bootstrap, explica o que fazer', async () => {
    await repositorio.limparBootstrap();

    await render(comQuery(<TesteLancamento />));

    expect(await screen.findByText('Ainda sem dados do servidor')).toBeTruthy();
  });

  it('usa o estoque padrão e mostra Agora → Depois com aviso de negativo', async () => {
    await escolher();

    expect(screen.getByText(/Barracão de Adubo/)).toBeTruthy();
    expect(screen.getByTestId('teste-previa')).toHaveTextContent(/Agora 0,5 L → Depois -0,5 L/);
    expect(screen.getByText('Vai ficar negativo')).toBeTruthy();
  });

  it('não deixa registrar sem responsável e produto', async () => {
    await render(comQuery(<TesteLancamento />));

    await fireEvent.press(await screen.findByTestId('teste-registrar'));

    expect(await lancamentos()).toEqual([]);
  });

  it('registra uma saída válida para o servidor, com a foto', async () => {
    await escolher();
    await fireEvent.press(screen.getByTestId('teste-foto'));
    await screen.findByRole('button', { name: 'Tirar outra foto (1)' });

    await fireEvent.press(screen.getByTestId('teste-registrar'));

    expect(await screen.findByTestId('teste-registrados')).toBeTruthy();
    const [operacao] = await lancamentos();
    expect(operacao?.dados).toMatchObject({
      tipo: 'SAIDA',
      motivo: 'OUTROS',
      motivo_texto: 'Teste do app',
      estoque_id: 2,
      responsavel_id: 7,
      itens: [{ produto_id: 10, quantidade: 1 }],
    });
    expect(await repositorio.listarAnexos()).toHaveLength(1);
    expect(dispararEnvio).toHaveBeenCalledWith('LANCAMENTO');
  });

  it('o saldo da tela já desconta o que foi registrado', async () => {
    await escolher();

    await fireEvent.press(screen.getByTestId('teste-registrar'));

    await waitFor(() =>
      expect(screen.getByTestId('teste-previa')).toHaveTextContent(/Agora -0,5 L → Depois -1,5 L/),
    );
  });

  it('cadastra um responsável e deixa usar por client_id', async () => {
    await render(comQuery(<TesteLancamento />));
    await fireEvent.press(await screen.findByTestId('teste-responsavel'));

    await fireEvent.press(await screen.findByRole('radio', { name: /Responsável teste/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Verdict Max' }));
    await fireEvent.press(screen.getByTestId('teste-registrar'));

    await screen.findByTestId('teste-registrados');
    const [operacao] = await lancamentos();
    expect(operacao?.dados.responsavel_client_id).toBe('uuid-1');
    expect(operacao?.dados).not.toHaveProperty('responsavel_id');
  });
});
