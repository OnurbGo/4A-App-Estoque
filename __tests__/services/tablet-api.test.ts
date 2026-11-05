import * as SecureStore from 'expo-secure-store';
import { definirEndereco } from '@/services/api-client';
import {
  buscarBootstrap,
  enviarFoto,
  enviarOperacoes,
  entrarNaConta,
  listarEstoques,
} from '@/services/tablet-api';
import { salvarCredenciais } from '@/services/token-storage';
import { servidorFalso } from './servidor-falso';

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado;

const bootstrap = {
  estoques: [{ id_almox_estoque: 1, nome: 'Casinha', grupo: 'INSUMOS' }],
  produtos: [{ id_almox_produto: 10, nome: 'Verdict', unidade: 'L' }],
  produtos_por_estoque: [
    { estoque_id: 1, produtos: [{ produto_id: 10, saldo: 12.5 }], recentes: [10] },
  ],
  responsaveis: [{ id_almox_responsavel: 7, nome: 'Carlos' }],
  terceiros: [{ id_entidade: '33', nome: 'Vizinho' }],
  maquinas: [
    { id_patrimonio: 5, nome: 'Trator', tipo_medidor: 'HORAS', medidor_atual: null },
  ],
  motivos: { SAIDA: ['EMPRESTIMO', 'OUTROS'] },
};

beforeEach(async () => {
  guardado.clear();
  definirEndereco('192.168.0.10');
  await salvarCredenciais({ email: 'a@b.c', senha: 'segredo', token: 'token' });
});

describe('rotas', () => {
  it('login vai para /core/auth/login com email e senha, sem token', async () => {
    const { pedidos } = servidorFalso(() => ({
      status: 201,
      data: { token: 't', usuario: { conta_id: 1, nome: 'Tablets', email: 'a@b.c' } },
    }));

    await entrarNaConta('a@b.c', 'segredo');

    expect(pedidos[0]).toMatchObject({
      metodo: 'POST',
      url: '/core/auth/login',
      baseURL: 'http://192.168.0.10/api',
      corpo: { email: 'a@b.c', senha: 'segredo' },
    });
    expect(pedidos[0]?.autorizacao).toBeUndefined();
  });

  it('estoques usam o endereço digitado, sem login', async () => {
    const { pedidos } = servidorFalso(() => ({
      status: 200,
      data: [{ id_almox_estoque: 1, nome: 'Casinha', grupo: 'INSUMOS' }],
    }));

    const estoques = await listarEstoques('10.0.0.9:8080');

    expect(estoques).toEqual([{ id_almox_estoque: 1, nome: 'Casinha', grupo: 'INSUMOS' }]);
    expect(pedidos[0]).toMatchObject({
      url: '/almoxarifado/tablet/estoques',
      baseURL: 'http://10.0.0.9:8080/api',
    });
    expect(pedidos[0]?.autorizacao).toBeUndefined();
  });

  it('endereço que responde outra coisa não é aceito como servidor', async () => {
    servidorFalso(() => ({ status: 200, data: '<html>roteador</html>' }));

    await expect(listarEstoques('192.168.0.1')).rejects.toMatchObject({
      message: expect.stringContaining('Confira o endereço'),
    });
  });

  it('bootstrap converte id em texto e ignora campo novo', async () => {
    servidorFalso(() => ({
      status: 200,
      data: { ...bootstrap, campo_novo: true },
    }));

    const dados = await buscarBootstrap();

    expect(dados.terceiros).toEqual([{ id_entidade: 33, nome: 'Vizinho' }]);
    expect(dados).not.toHaveProperty('campo_novo');
    expect(dados.motivos.SAIDA).toEqual(['EMPRESTIMO', 'OUTROS']);
  });

  it('bootstrap quebrado é recusado, para não substituir o que está guardado', async () => {
    servidorFalso(() => ({ status: 200, data: { ...bootstrap, produtos: 'não é lista' } }));

    await expect(buscarBootstrap()).rejects.toMatchObject({ statusCode: 502 });
  });

  it('sync manda dispositivo e operações e devolve os resultados', async () => {
    const resultados = [
      { client_id: 'a', tipo: 'LANCAMENTO_CRIAR', status: 'SINCRONIZADO', lancamento_id: 1 },
    ];
    const { pedidos } = servidorFalso(() => ({ status: 200, data: { resultados } }));
    const operacoes = [{ tipo: 'RESPONSAVEL_CRIAR' as const, client_id: 'a', nome: 'Ana' }];

    await expect(enviarOperacoes('SM-T220 abc123', operacoes)).resolves.toEqual(resultados);

    expect(pedidos[0]).toMatchObject({
      metodo: 'POST',
      url: '/almoxarifado/tablet/sync',
      autorizacao: 'Bearer token',
      corpo: { dispositivo: 'SM-T220 abc123', operacoes },
    });
  });

  it('foto vai em multipart com arquivo, client_id e lancamento_client_id', async () => {
    const { pedidos } = servidorFalso(() => ({
      status: 200,
      data: { status: 'AGUARDANDO_LANCAMENTO' },
    }));

    const status = await enviarFoto({
      client_id: 'foto-1',
      lancamento_client_id: 'lancamento-1',
      caminho: 'file:///anexos/foto-1.jpg',
    });

    expect(status).toBe('AGUARDANDO_LANCAMENTO');
    expect(pedidos[0]?.url).toBe('/almoxarifado/tablet/anexos');
    expect(pedidos[0]?.config.headers.getContentType()).toContain('multipart/form-data');

    const corpo = pedidos[0]?.corpo as unknown as { keys: () => Iterable<string> };
    expect(Array.from(corpo.keys())).toEqual(['client_id', 'lancamento_client_id', 'arquivo']);
  });
});
