import * as SecureStore from 'expo-secure-store';
import { apiClient, definirAoEncerrarSessao, definirEndereco, ROTA_LOGIN } from '@/services/api-client';
import { ApiError, toFriendlyError } from '@/services/errors';
import {
  lerCredenciais,
  lerEmail,
  lerToken,
  salvarCredenciais,
  senhaConfere,
} from '@/services/token-storage';
import { servidorFalso, type RespostaFalsa, type Rota } from './servidor-falso';

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado;

const ROTA = '/almoxarifado/tablet/bootstrap';

const login = { token: 'token-novo', usuario: { conta_id: 1, nome: 'Tablets', email: 'a@b.c' } };

/** O servidor com o token vencido: só aceita o `token-novo`. */
const tokenVencido =
  (respostaDoLogin: RespostaFalsa): Rota =>
  ({ url, autorizacao }) => {
    if (url === ROTA_LOGIN) return respostaDoLogin;
    return autorizacao === 'Bearer token-novo'
      ? { status: 200, data: 'ok' }
      : { status: 401, data: { statusCode: 401, message: 'Token invalido ou expirado.' } };
  };

let encerrouSessao: jest.Mock;

beforeEach(async () => {
  guardado.clear();
  encerrouSessao = jest.fn();
  definirAoEncerrarSessao(encerrouSessao);
  definirEndereco('192.168.0.10');
  await salvarCredenciais({ email: 'a@b.c', senha: 'segredo', token: 'token-velho' });
});

describe('pedidos', () => {
  it('usa o endereço do aparelho, com /api, e manda o token', async () => {
    const { pedidos } = servidorFalso(() => ({ status: 200, data: 'ok' }));

    await apiClient.get(ROTA);

    expect(pedidos[0]).toMatchObject({
      baseURL: 'http://192.168.0.10/api',
      url: ROTA,
      autorizacao: 'Bearer token-velho',
    });
  });

  it('não existe servidor padrão: sem endereço, nem tenta', async () => {
    const { pedidos } = servidorFalso(() => ({ status: 200 }));
    definirEndereco(null);

    await expect(apiClient.get(ROTA)).rejects.toMatchObject({
      statusCode: 0,
      message: expect.stringContaining('Opções avançadas'),
    });
    expect(pedidos).toEqual([]);
  });
});

describe('401: novo login com as credenciais salvas (D2)', () => {
  it('renova o token e repete o pedido', async () => {
    const { pedidos } = servidorFalso(tokenVencido({ status: 201, data: login }));

    const resposta = await apiClient.get(ROTA);

    expect(resposta.data).toBe('ok');
    expect(pedidos.map(({ url }) => url)).toEqual([ROTA, ROTA_LOGIN, ROTA]);
    expect(pedidos[1]?.corpo).toEqual({ email: 'a@b.c', senha: 'segredo' });
    expect(await lerToken()).toBe('token-novo');
    expect(encerrouSessao).not.toHaveBeenCalled();
  });

  it('o novo login não leva o token velho', async () => {
    const { pedidos } = servidorFalso(tokenVencido({ status: 201, data: login }));

    await apiClient.get(ROTA);

    expect(pedidos[1]?.autorizacao).toBeUndefined();
  });

  it('vários pedidos ao mesmo tempo fazem um login só', async () => {
    const { pedidos } = servidorFalso(tokenVencido({ status: 201, data: login }));

    await Promise.all([apiClient.get(ROTA), apiClient.get(ROTA), apiClient.get(ROTA)]);

    expect(pedidos.filter(({ url }) => url === ROTA_LOGIN)).toHaveLength(1);
  });

  it('não repete sem parar se o servidor continuar recusando', async () => {
    const { pedidos } = servidorFalso(({ url }) =>
      url === ROTA_LOGIN ? { status: 201, data: login } : { status: 401 },
    );

    await expect(apiClient.get(ROTA)).rejects.toMatchObject({ statusCode: 401 });

    expect(pedidos.filter(({ url }) => url === ROTA_LOGIN)).toHaveLength(1);
    expect(pedidos.filter(({ url }) => url === ROTA)).toHaveLength(2);
  });
});

describe('quando a senha da conta mudou', () => {
  beforeEach(() => {
    servidorFalso(
      tokenVencido({ status: 401, data: { statusCode: 401, message: 'E-mail ou senha inválidos.' } }),
    );
  });

  it('avisa, encerra a sessão e apaga senha e token', async () => {
    await expect(apiClient.get(ROTA)).rejects.toMatchObject({
      statusCode: 401,
      message: 'A senha da conta mudou. Entre de novo.',
    });

    expect(encerrouSessao).toHaveBeenCalledTimes(1);
    expect(await lerToken()).toBeNull();
    expect(await lerCredenciais()).toBeNull();
  });

  it('mantém o e-mail para o próximo login', async () => {
    await expect(apiClient.get(ROTA)).rejects.toBeInstanceOf(ApiError);

    expect(await lerEmail()).toBe('a@b.c');
  });
});

describe('falha que não é da senha não desloga', () => {
  it.each([
    ['sem rede', 'SEM_REDE' as const, 0],
    ['tempo esgotado', 'DEMOROU' as const, 0],
    ['muitas tentativas', { status: 429, data: { message: 'Muitas tentativas.' } }, 429],
    ['servidor fora', { status: 503 }, 503],
  ])('%s', async (_nome, respostaDoLogin, statusCode) => {
    servidorFalso(tokenVencido(respostaDoLogin));

    await expect(apiClient.get(ROTA)).rejects.toMatchObject({ statusCode });

    expect(encerrouSessao).not.toHaveBeenCalled();
    expect(await lerCredenciais()).toEqual({ email: 'a@b.c', senha: 'segredo' });
    expect(await lerToken()).toBe('token-velho');
  });

  it('depois de uma falha de rede, o próximo pedido tenta o login de novo', async () => {
    let semRede = true;
    const { pedidos } = servidorFalso(({ url, autorizacao }) => {
      if (url === ROTA_LOGIN) return semRede ? 'SEM_REDE' : { status: 201, data: login };
      return autorizacao === 'Bearer token-novo' ? { status: 200, data: 'ok' } : { status: 401 };
    });

    await expect(apiClient.get(ROTA)).rejects.toMatchObject({ statusCode: 0 });
    semRede = false;
    const resposta = await apiClient.get(ROTA);

    expect(resposta.data).toBe('ok');
    expect(pedidos.filter(({ url }) => url === ROTA_LOGIN)).toHaveLength(2);
  });
});

describe('sem credenciais salvas', () => {
  it('encerra a sessão em vez de tentar login', async () => {
    guardado.clear();
    await salvarCredenciais({ email: 'a@b.c', senha: '', token: 'token-velho' });
    const { pedidos } = servidorFalso(() => ({ status: 401 }));

    await expect(apiClient.get(ROTA)).rejects.toMatchObject({ statusCode: 401 });

    expect(encerrouSessao).toHaveBeenCalledTimes(1);
    expect(pedidos.map(({ url }) => url)).toEqual([ROTA]);
  });
});

describe('senhaConfere', () => {
  it('compara com a senha salva no aparelho', async () => {
    expect(await senhaConfere('segredo')).toBe(true);
    expect(await senhaConfere('errada')).toBe(false);
  });

  it('sem senha salva, nada confere', async () => {
    guardado.clear();

    expect(await senhaConfere('')).toBe(false);
  });
});

describe('toFriendlyError', () => {
  const erroHttp = async (status: number, data?: unknown) => {
    servidorFalso(() => ({ status, data }));
    return apiClient.get('/qualquer').catch((erro: unknown) => erro);
  };

  it('usa a mensagem do servidor, como texto ou como lista', async () => {
    expect(await erroHttp(400, { message: 'Campo inválido.' })).toMatchObject({
      message: 'Campo inválido.',
    });
    expect(await erroHttp(400, { message: ['Primeiro.', 'Segundo.'] })).toMatchObject({
      message: 'Primeiro.',
    });
  });

  it('traduz 403 e 5xx para o que a pessoa entende', async () => {
    expect(await erroHttp(403, { message: 'Forbidden' })).toMatchObject({
      statusCode: 403,
      message: 'Esta conta não tem acesso aos tablets.',
    });
    expect(await erroHttp(500)).toMatchObject({
      statusCode: 500,
      message: expect.stringContaining('servidor teve um problema'),
    });
  });

  it('tem resposta para o corpo que não é do Nest', async () => {
    expect(await erroHttp(404, '<html></html>')).toMatchObject({ statusCode: 404 });
  });

  it('não embrulha duas vezes, e aguenta erro que não é de rede', () => {
    const erro = new ApiError(418, 'Já tratado.');

    expect(toFriendlyError(erro)).toBe(erro);
    expect(toFriendlyError(new Error('qualquer'))).toMatchObject({ statusCode: 500 });
  });
});
