import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import Inicio from '@/app/(app)/index';
import Pendencias from '@/app/(app)/pendencias';
import type { Repositorio } from '@/banco';
import type { NovaOperacao } from '@/regras/operacoes';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';
import { repositorioEmMemoria } from '../banco/sqljs';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
  };
});
jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));
jest.mock('@/sync', () => ({ dispararEnvio: jest.fn(async () => undefined) }));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');
const CRIADO_EM = '2026-11-05T12:00:00.000Z';

const saida = (client_id: string, extra: Record<string, unknown> = {}): NovaOperacao => ({
  tipo: 'LANCAMENTO_CRIAR',
  client_id,
  dados: {
    tipo: 'SAIDA',
    estoque_id: 1,
    responsavel_id: 7,
    ocorrido_em: CRIADO_EM,
    itens: [{ produto_id: 10, quantidade: 2 }],
    ...extra,
  },
  nomes: { responsavel: 'Carlos', estoque: 'Casinha', produtos: { 10: 'Verdict' } },
});

const voltarParaFila = (client_id: string, tentativas: number, mensagem: string) => ({
  client_id,
  status: 'ERRO' as const,
  tentativas,
  mensagem,
  id_servidor: null,
  enviado_em: null,
  proxima_tentativa_em: null,
});

let repositorio: Repositorio;

function comQuery(tela: ReactNode) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={cliente}>{tela}</QueryClientProvider>;
}

beforeEach(async () => {
  mockPush.mockClear();
  mockBack.mockClear();
  jest.mocked(dispararEnvio).mockClear();
  ({ repositorio } = await repositorioEmMemoria());
  banco.obterRepositorio.mockResolvedValue(repositorio);
  useEnvioStore.setState({ conectado: true, servidorRespondeu: true, rodada: 0 });
});

describe('Pendências', () => {
  it('sem nada pendente, diz que está tudo no sistema', async () => {
    await render(comQuery(<Pendencias />));

    expect(await screen.findByText('Nada aguardando envio')).toBeTruthy();
    expect(screen.getByText('Tudo enviado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tudo enviado' })).toBeNull();
    expect(screen.queryByTestId('pendencias-tentar')).toBeNull();
  });

  it('operação em TENTAR_NOVAMENTE aparece com a mensagem do servidor', async () => {
    await repositorio.enfileirar(saida('a'), CRIADO_EM);
    await repositorio.aplicarAlteracoes([voltarParaFila('a', 1, 'O envio será repetido.')]);

    await render(comQuery(<Pendencias />));

    const cartao = within(await screen.findByTestId('pendencia-a'));
    expect(cartao.getByText('Aguardando envio')).toBeTruthy();
    expect(cartao.getByText('Saída · Carlos')).toBeTruthy();
    expect(cartao.getByText('O envio será repetido.')).toBeTruthy();
  });

  it('operação presa aparece como Parado e conta na atenção', async () => {
    await repositorio.enfileirar(saida('a'), CRIADO_EM);
    await repositorio.aplicarAlteracoes([voltarParaFila('a', 3, 'Não foi possível gravar.')]);

    await render(comQuery(<Pendencias />));

    expect(within(await screen.findByTestId('pendencia-a')).getByText('Parado')).toBeTruthy();
    expect(screen.getByText('1 precisa de atenção')).toBeTruthy();
  });

  it('mostra quem foi recusado e o que fazer, sem botão de apagar', async () => {
    await repositorio.enfileirar(saida('a'), CRIADO_EM);
    await repositorio.aplicarAlteracoes([
      {
        client_id: 'a',
        status: 'RECUSADO',
        tentativas: 1,
        mensagem: 'Campo inválido: itens.',
        id_servidor: null,
        enviado_em: null,
        proxima_tentativa_em: null,
      },
    ]);

    await render(comQuery(<Pendencias />));

    const cartao = within(await screen.findByTestId('pendencia-a'));
    expect(cartao.getByText('Recusado')).toBeTruthy();
    expect(cartao.getByText('Campo inválido: itens.')).toBeTruthy();
    expect(cartao.getByText(/Baixa manual/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /apagar|excluir|descartar/i })).toBeNull();
    expect(screen.queryByTestId('pendencias-tentar')).toBeNull();
  });

  it('lançamento de responsável recusado explica por que está parado (D23)', async () => {
    await repositorio.enfileirar(
      { tipo: 'RESPONSAVEL_CRIAR', client_id: 'r', nome: 'Zé' },
      CRIADO_EM,
    );
    await repositorio.enfileirar(
      saida('a', { responsavel_id: undefined, responsavel_client_id: 'r' }),
      CRIADO_EM,
    );
    await repositorio.aplicarAlteracoes([
      {
        client_id: 'r',
        status: 'RECUSADO',
        tentativas: 1,
        mensagem: 'Nome inválido.',
        id_servidor: null,
        enviado_em: null,
        proxima_tentativa_em: null,
      },
    ]);

    await render(comQuery(<Pendencias />));

    const cartao = within(await screen.findByTestId('pendencia-a'));
    expect(cartao.getByText('Parado')).toBeTruthy();
    expect(cartao.getByText(/cadastro de Zé foi recusado/)).toBeTruthy();
  });

  it('mostra as fotos que vão junto', async () => {
    await repositorio.enfileirar(saida('a'), CRIADO_EM, [
      { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
    ]);

    await render(comQuery(<Pendencias />));

    expect(await screen.findByText('1 foto junto')).toBeTruthy();
  });

  it('tentar agora zera as esperas e envia', async () => {
    await repositorio.enfileirar(saida('a'), CRIADO_EM);
    await render(comQuery(<Pendencias />));

    await fireEvent.press(await screen.findByRole('button', { name: 'Tentar enviar agora' }));

    expect(dispararEnvio).toHaveBeenCalledWith('ABRIR');
  });

  it('relê o banco depois de cada rodada', async () => {
    await repositorio.enfileirar(saida('a'), CRIADO_EM);
    await render(comQuery(<Pendencias />));
    await screen.findByTestId('pendencia-a');

    await repositorio.aplicarAlteracoes([
      {
        client_id: 'a',
        status: 'ENVIADO',
        tentativas: 1,
        mensagem: null,
        id_servidor: 1,
        enviado_em: '2026-11-05T12:30:00.000Z',
        proxima_tentativa_em: null,
      },
    ]);
    await act(async () => useEnvioStore.getState().registrarRodada(true));

    await waitFor(() => expect(screen.queryByTestId('pendencia-a')).toBeNull());
    expect(screen.getByText('Nada aguardando envio')).toBeTruthy();
  });
});

describe('Início', () => {
  it('mostra o estoque padrão e o indicador', async () => {
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 1 });
    await repositorio.salvarBootstrap(
      {
        estoques: [{ id_almox_estoque: 1, nome: 'Casinha de defensivos', grupo: 'INSUMOS' }],
        produtos: [],
        produtos_por_estoque: [],
        responsaveis: [],
        terceiros: [],
        maquinas: [],
        motivos: {},
      },
      CRIADO_EM,
    );
    await repositorio.enfileirar(saida('a'), CRIADO_EM);

    await render(comQuery(<Inicio />));

    expect(await screen.findByText('Casinha de defensivos')).toBeTruthy();
    expect(await screen.findByText('1 aguardando envio')).toBeTruthy();
  });

  it('tocar no indicador abre as Pendências', async () => {
    await render(comQuery(<Inicio />));

    await fireEvent.press(await screen.findByTestId('indicador-envio'));

    expect(mockPush).toHaveBeenCalledWith('/pendencias');
  });

  it('sem conexão, avisa e mostra Sem conexão', async () => {
    useEnvioStore.setState({ conectado: false });

    await render(comQuery(<Inicio />));

    expect(await screen.findByTestId('offline-status-banner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sem conexão' })).toBeTruthy();
  });

  it('com Wi-Fi mas sem o servidor, também é Sem conexão', async () => {
    useEnvioStore.setState({ conectado: true, servidorRespondeu: false });

    await render(comQuery(<Inicio />));

    expect(await screen.findByRole('button', { name: 'Sem conexão' })).toBeTruthy();
  });
});
