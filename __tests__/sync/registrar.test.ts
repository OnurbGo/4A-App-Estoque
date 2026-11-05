import type { Repositorio } from '@/banco';
import type { OperacaoLancamento } from '@/regras/tipos';
import { apagarFoto, guardarFoto } from '@/services/fotos';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';
import { registrarLancamento, registrarResponsavel } from '@/sync/registrar';
import { repositorioEmMemoria } from '../banco/sqljs';

jest.mock('@/banco', () => ({ obterRepositorio: jest.fn() }));
jest.mock('@/sync', () => ({ dispararEnvio: jest.fn(async () => undefined) }));
jest.mock('@/services/fotos', () => ({
  guardarFoto: jest.fn(async (_foto: unknown, id: string) => `file:///anexos/${id}.jpg`),
  apagarFoto: jest.fn(),
}));

let proximoId = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${(proximoId += 1)}`,
}));

const banco = jest.requireMock<{ obterRepositorio: jest.Mock }>('@/banco');

const novo = {
  dados: {
    tipo: 'SAIDA' as const,
    estoque_id: 1,
    responsavel_id: 7,
    itens: [{ produto_id: 10, quantidade: 2 }],
  },
  nomes: { responsavel: 'Carlos', estoque: 'Casinha', produtos: { 10: 'Verdict' } },
  fotos: [],
};

const foto = { uri: 'file:///cache/foto.jpg', largura: 4000, altura: 3000 };

let repositorio: Repositorio;

beforeEach(async () => {
  proximoId = 0;
  jest.mocked(dispararEnvio).mockClear();
  jest.mocked(apagarFoto).mockClear();
  jest.mocked(guardarFoto).mockClear();
  ({ repositorio } = await repositorioEmMemoria());
  banco.obterRepositorio.mockResolvedValue(repositorio);
});

const lancamentos = async () =>
  (await repositorio.listarOperacoesEmAberto(null)) as OperacaoLancamento[];

describe('registrarLancamento', () => {
  it('grava na fila com client_id e a hora do tablet', async () => {
    const clientId = await registrarLancamento(novo);

    const [operacao] = await lancamentos();
    expect(operacao?.client_id).toBe(clientId);
    expect(operacao?.status).toBe('PENDENTE');
    expect(Date.parse(operacao?.dados.ocorrido_em ?? '')).not.toBeNaN();
    expect(operacao?.dados.ocorrido_em).toMatch(/Z$/);
  });

  it('dispara o envio e avisa as telas depois de gravar', async () => {
    const antes = useEnvioStore.getState().rodada;

    await registrarLancamento(novo);

    expect(dispararEnvio).toHaveBeenCalledWith('LANCAMENTO');
    expect(useEnvioStore.getState().rodada).toBe(antes + 1);
  });

  it('não depende do envio: lançamento fica gravado mesmo sem rede', async () => {
    jest.mocked(dispararEnvio).mockImplementation(() => new Promise(() => undefined));

    await registrarLancamento(novo);

    expect(await lancamentos()).toHaveLength(1);
    jest.mocked(dispararEnvio).mockResolvedValue(undefined);
  });

  it('guarda as fotos ligadas ao lançamento', async () => {
    const clientId = await registrarLancamento({ ...novo, fotos: [foto, foto] });

    const anexos = await repositorio.listarAnexos();
    expect(anexos).toHaveLength(2);
    expect(anexos[0]?.lancamento_client_id).toBe(clientId);
    expect(guardarFoto).toHaveBeenCalledTimes(2);
  });

  it('se não conseguir gravar, não deixa foto solta nem envia', async () => {
    jest
      .spyOn(repositorio, 'enfileirar')
      .mockRejectedValueOnce(new Error('Disco cheio'));

    await expect(registrarLancamento({ ...novo, fotos: [foto] })).rejects.toThrow('Disco cheio');

    expect(apagarFoto).toHaveBeenCalledTimes(1);
    expect(dispararEnvio).not.toHaveBeenCalled();
  });

  it('se uma foto falhar, apaga as anteriores e não grava nada', async () => {
    jest
      .mocked(guardarFoto)
      .mockResolvedValueOnce('file:///anexos/1.jpg')
      .mockRejectedValueOnce(new Error('Sem espaço'));

    await expect(registrarLancamento({ ...novo, fotos: [foto, foto] })).rejects.toThrow(
      'Sem espaço',
    );

    expect(apagarFoto).toHaveBeenCalledWith('file:///anexos/1.jpg');
    expect(await lancamentos()).toEqual([]);
  });
});

describe('registrarResponsavel', () => {
  it('grava na fila com o nome aparado e dispara o envio', async () => {
    const clientId = await registrarResponsavel('  Ana  ');

    expect((await repositorio.listarOperacoesEmAberto(null))[0]).toMatchObject({
      tipo: 'RESPONSAVEL_CRIAR',
      client_id: clientId,
      nome: 'Ana',
    });
    expect(dispararEnvio).toHaveBeenCalledWith('LANCAMENTO');
  });
});
