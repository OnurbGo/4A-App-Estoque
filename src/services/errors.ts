import axios from 'axios';

/** `statusCode` 0 significa que o servidor nem respondeu. */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const SEM_CONEXAO = 'Sem conexão com o servidor. Confira a rede e o endereço.';
const DEMOROU = 'A conexão demorou demais. Tente de novo.';
const SEM_ACESSO = 'Esta conta não tem acesso aos tablets.';
const ERRO_NO_SERVIDOR = 'O servidor teve um problema. Tente de novo em instantes.';
const ERRO_GENERICO = 'Não foi possível concluir. Tente de novo.';

/** O Nest manda `message` como texto ou, na validação, como lista. */
function mensagemDoServidor(corpo: unknown): string | null {
  if (typeof corpo !== 'object' || corpo === null) return null;

  const { message } = corpo as { message?: unknown };
  if (typeof message === 'string' && message) return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return null;
}

export function toFriendlyError(erro: unknown): ApiError {
  if (erro instanceof ApiError) return erro;

  if (axios.isAxiosError(erro)) {
    const resposta = erro.response;
    if (!resposta) return new ApiError(0, erro.code === 'ECONNABORTED' ? DEMOROU : SEM_CONEXAO);

    const { status } = resposta;
    if (status === 403) return new ApiError(status, SEM_ACESSO);
    if (status >= 500) return new ApiError(status, ERRO_NO_SERVIDOR);
    return new ApiError(status, mensagemDoServidor(resposta.data) ?? ERRO_GENERICO);
  }

  return new ApiError(500, ERRO_GENERICO);
}
