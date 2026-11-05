import type { Repositorio } from '@/banco';
import { ApiError } from '@/services/errors';
import { buscarBootstrap, enviarOperacoes } from '@/services/tablet-api';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';
import { repositorioEmMemoria } from '../banco/sqljs';

jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));
jest.mock('@/services/tablet-api', () => ({
  buscarBootstrap: jest.fn(),
  enviarFoto: jest.fn(),
  enviarOperacoes: jest.fn(),
}));
jest.mock('@/services/fotos', () => ({ apagarFoto: jest.fn(), fotoExiste: jest.fn(() => true) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id-do-aparelho' }));
jest.mock('expo-device', () => ({ modelName: 'SM-T220' }));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');

const operacao = (client_id: string) => ({
  tipo: 'LANCAMENTO_CRIAR' as const,
  client_id,
  dados: {
    tipo: 'SAIDA' as const,
    estoque_id: 1,
    responsavel_id: 7,
    ocorrido_em: '2026-11-05T12:00:00.000Z',
    itens: [{ produto_id: 10, quantidade: 1 }],
  },
  nomes: { responsavel: 'Carlos', estoque: 'Casinha', produtos: { 10: 'Verdict' } },
});

let repositorio: Repositorio;

beforeAll(async () => {
  ({ repositorio } = await repositorioEmMemoria());
  banco.obterRepositorio.mockResolvedValue(repositorio);
});

beforeEach(() => {
  jest.mocked(enviarOperacoes).mockReset();
  jest.mocked(buscarBootstrap).mockReset();
  useEnvioStore.setState({ conectado: true, ultimaFalha: null, rodada: 0 });
});

describe('o motor ligado às telas', () => {
  it('conta sem acesso chega ao estado que as telas leem, e a fila continua guardada', async () => {
    await repositorio.enfileirar(operacao('a'), '2026-11-05T12:00:00.000Z');
    jest
      .mocked(enviarOperacoes)
      .mockRejectedValue(new ApiError(403, 'Esta conta não tem acesso aos tablets.'));

    await dispararEnvio('ABRIR');

    expect(useEnvioStore.getState()).toMatchObject({
      ultimaFalha: { statusCode: 403, mensagem: 'Esta conta não tem acesso aos tablets.' },
      rodada: 1,
    });
    expect(await repositorio.listarOperacoesEmAberto(null)).toEqual([
      expect.objectContaining({ client_id: 'a', status: 'PENDENTE', tentativas: 0 }),
    ]);
  });

  it('uma rodada certa apaga a falha, e o nome do aparelho vai no envio', async () => {
    jest
      .mocked(enviarOperacoes)
      .mockResolvedValue([{ client_id: 'a', status: 'SINCRONIZADO', lancamento_id: 1 }]);
    jest.mocked(buscarBootstrap).mockResolvedValue({
      estoques: [],
      produtos: [],
      produtos_por_estoque: [],
      responsaveis: [],
      terceiros: [],
      maquinas: [],
      motivos: {},
    });
    useEnvioStore.setState({ ultimaFalha: { statusCode: 403, mensagem: 'Sem acesso.' } });

    await dispararEnvio('ABRIR');

    expect(useEnvioStore.getState().ultimaFalha).toBeNull();
    expect(jest.mocked(enviarOperacoes).mock.calls[0]?.[0]).toBe('SM-T220 iddoap');
  });
});
