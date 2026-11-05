import type { z } from 'zod';
import { urlDaApi } from '@/regras/endereco';
import type { ResultadoAnexo, ResultadoOperacao } from '@/regras/fila';
import type { CorpoOperacao } from '@/regras/operacoes';
import type { Bootstrap, Estoque } from '@/regras/tipos';
import {
  apiClient,
  clienteSemSessao,
  ROTA_LOGIN,
  type RespostaLogin,
} from './api-client';
import { esquemaAnexo, esquemaBootstrap, esquemaEstoques, esquemaSync } from './contratos';
import { ApiError } from './errors';

const ROTA_ESTOQUES = '/almoxarifado/tablet/estoques';
const ROTA_BOOTSTRAP = '/almoxarifado/tablet/bootstrap';
const ROTA_SYNC = '/almoxarifado/tablet/sync';
const ROTA_ANEXOS = '/almoxarifado/tablet/anexos';

const TEMPO_LIMITE_BOOTSTRAP_MS = 30_000;
const TEMPO_LIMITE_ENVIO_MS = 60_000;

const RESPOSTA_INESPERADA = 'A resposta não veio do servidor do Gestão 4A. Confira o endereço.';

function validar<T>(esquema: z.ZodType<T, unknown>, dados: unknown): T {
  const resultado = esquema.safeParse(dados);
  if (!resultado.success) throw new ApiError(502, RESPOSTA_INESPERADA);
  return resultado.data;
}

export async function entrarNaConta(email: string, senha: string): Promise<RespostaLogin> {
  const { data } = await clienteSemSessao.post<RespostaLogin>(ROTA_LOGIN, { email, senha });
  return data;
}

/** Rota sem login. É também o "Testar conexão": usa o endereço digitado, ainda não salvo. */
export async function listarEstoques(endereco: string): Promise<Estoque[]> {
  const { data } = await clienteSemSessao.get<unknown>(ROTA_ESTOQUES, {
    baseURL: urlDaApi(endereco),
  });
  return validar(esquemaEstoques, data);
}

export async function buscarBootstrap(): Promise<Bootstrap> {
  const { data } = await apiClient.get<unknown>(ROTA_BOOTSTRAP, {
    timeout: TEMPO_LIMITE_BOOTSTRAP_MS,
  });
  return validar(esquemaBootstrap, data);
}

export async function enviarOperacoes(
  dispositivo: string,
  operacoes: readonly CorpoOperacao[],
): Promise<ResultadoOperacao[]> {
  const { data } = await apiClient.post<unknown>(
    ROTA_SYNC,
    { dispositivo, operacoes },
    { timeout: TEMPO_LIMITE_ENVIO_MS },
  );
  return validar(esquemaSync, data).resultados;
}

export type FotoParaEnvio = {
  client_id: string;
  lancamento_client_id: string;
  caminho: string;
};

export async function enviarFoto({
  client_id,
  lancamento_client_id,
  caminho,
}: FotoParaEnvio): Promise<ResultadoAnexo> {
  const formulario = new FormData();
  formulario.append('client_id', client_id);
  formulario.append('lancamento_client_id', lancamento_client_id);
  formulario.append('arquivo', {
    uri: caminho,
    name: `${client_id}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  const { data } = await apiClient.post<unknown>(ROTA_ANEXOS, formulario, {
    timeout: TEMPO_LIMITE_ENVIO_MS,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return validar(esquemaAnexo, data).status;
}
