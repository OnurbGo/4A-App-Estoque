import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, clienteSemSessao } from '@/services/api-client';

export type Rota = (pedido: PedidoFalso) => RespostaFalsa | Promise<RespostaFalsa>;

export type PedidoFalso = {
  url: string;
  metodo: string;
  baseURL: string | undefined;
  autorizacao: string | undefined;
  corpo: unknown;
  config: InternalAxiosRequestConfig;
};

export type RespostaFalsa = { status: number; data?: unknown } | 'SEM_REDE' | 'DEMOROU';

/** Responde como o axios: erro para status de falha, sem resposta quando cai a rede. */
export function servidorFalso(rota: Rota) {
  const pedidos: PedidoFalso[] = [];

  const adaptador: AxiosAdapter = async (config) => {
    const pedido: PedidoFalso = {
      url: config.url ?? '',
      metodo: (config.method ?? 'get').toUpperCase(),
      baseURL: config.baseURL,
      autorizacao: config.headers.get('Authorization') as string | undefined,
      corpo: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
      config,
    };
    pedidos.push(pedido);

    const resposta = await rota(pedido);
    if (resposta === 'SEM_REDE') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    if (resposta === 'DEMOROU') throw new AxiosError('timeout', 'ECONNABORTED', config);

    const completa = {
      data: resposta.data,
      status: resposta.status,
      statusText: '',
      headers: {},
      config,
    };
    if (resposta.status >= 400) {
      throw new AxiosError('Falhou', 'ERR_BAD_RESPONSE', config, null, completa);
    }
    return completa;
  };

  apiClient.defaults.adapter = adaptador;
  clienteSemSessao.defaults.adapter = adaptador;

  return { pedidos };
}
