import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { urlDaApi } from '@/regras/endereco';
import { ApiError, toFriendlyError } from './errors';
import { lerCredenciais, lerToken, limparCredenciais, salvarToken } from './token-storage';

const TEMPO_LIMITE_MS = 15_000;

export const ROTA_LOGIN = '/core/auth/login';

const SENHA_MUDOU = 'A senha da conta mudou. Entre de novo.';
const SEM_ENDERECO = 'Informe o endereço do servidor em Opções avançadas.';

export type UsuarioLogado = {
  conta_id: number;
  nome: string;
  email: string;
};

export type RespostaLogin = { token: string; usuario: UsuarioLogado };

type ConfigComRepeticao = InternalAxiosRequestConfig & { _repetido?: boolean };

let baseUrl: string | null = null;
let novoLogin: Promise<string | null> | null = null;
let aoEncerrarSessao: (() => void) | null = null;

/** O endereço vem do `config` do aparelho: não existe servidor padrão. */
export function definirEndereco(endereco: string | null): void {
  baseUrl = endereco ? urlDaApi(endereco) : null;
}

export function definirAoEncerrarSessao(acao: (() => void) | null): void {
  aoEncerrarSessao = acao;
}

/** Login e rotas sem conta: sem token e sem renovação. */
export const clienteSemSessao: AxiosInstance = axios.create({
  timeout: TEMPO_LIMITE_MS,
  headers: { Accept: 'application/json' },
});

export const apiClient: AxiosInstance = axios.create({
  timeout: TEMPO_LIMITE_MS,
  headers: { Accept: 'application/json' },
});

function comEndereco(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (!baseUrl) throw new ApiError(0, SEM_ENDERECO);
  config.baseURL = baseUrl;
  return config;
}

clienteSemSessao.interceptors.request.use((config) => {
  // O "Testar conexão" manda o endereço digitado, que ainda não foi salvo.
  return config.baseURL ? config : comEndereco(config);
});

clienteSemSessao.interceptors.response.use(
  (resposta) => resposta,
  (erro: unknown) => {
    throw toFriendlyError(erro);
  },
);

apiClient.interceptors.request.use(async (config) => {
  comEndereco(config);
  const token = await lerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Renova o login com as credenciais salvas (D2). Só um 401 aqui encerra a sessão: sem rede, com
 * 429 ou com o servidor fora, o tablet segue offline e tenta de novo depois.
 */
async function refazerLogin(): Promise<string | null> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    await limparCredenciais();
    aoEncerrarSessao?.();
    return null;
  }

  try {
    const { data } = await clienteSemSessao.post<RespostaLogin>(ROTA_LOGIN, credenciais);
    await salvarToken(data.token);
    return data.token;
  } catch (erro) {
    const amigavel = toFriendlyError(erro);
    if (amigavel.statusCode !== 401) throw amigavel;

    await limparCredenciais();
    aoEncerrarSessao?.();
    return null;
  }
}

function refazerLoginUmaVez(): Promise<string | null> {
  novoLogin ??= refazerLogin().finally(() => {
    novoLogin = null;
  });
  return novoLogin;
}

apiClient.interceptors.response.use(
  (resposta) => resposta,
  async (erro: AxiosError) => {
    const config = erro.config as ConfigComRepeticao | undefined;
    if (erro.response?.status !== 401 || !config || config._repetido) {
      throw toFriendlyError(erro);
    }

    config._repetido = true;
    const token = await refazerLoginUmaVez();
    if (!token) throw new ApiError(401, SENHA_MUDOU);

    config.headers.Authorization = `Bearer ${token}`;
    return apiClient(config);
  },
);
