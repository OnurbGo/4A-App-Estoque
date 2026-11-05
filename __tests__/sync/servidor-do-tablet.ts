import type { ResultadoAnexo, ResultadoOperacao } from '@/regras/fila';
import type { CorpoOperacao } from '@/regras/operacoes';
import type { Bootstrap } from '@/regras/tipos';
import { ApiError } from '@/services/errors';
import type { FotoParaEnvio } from '@/services/tablet-api';
import type { PortaApi } from '@/sync/motor';

/**
 * Imita o `TabletSyncService`: idempotente por `client_id`, com responsável por `client_id`
 * e foto que espera o lançamento. Serve para contar o que realmente chegou ao servidor.
 */
export function servidorDoTablet() {
  const lancamentos = new Map<string, number>();
  const responsaveis = new Map<string, number>();
  const fotos = new Map<string, FotoParaEnvio>();
  const lotes: CorpoOperacao[][] = [];
  let proximoId = 100;

  const falhas = {
    /** Status por operação, para simular `TENTAR_NOVAMENTE` e `RECUSADO`. */
    porOperacao: new Map<string, ResultadoOperacao['status']>(),
    /** Erro do `POST /sync` inteiro. */
    sync: null as ApiError | null,
    foto: null as ApiError | null,
    bootstrap: null as ApiError | null,
  };

  const contagem = { bootstrap: 0 };
  let bootstrap: Bootstrap = {
    estoques: [],
    produtos: [],
    produtos_por_estoque: [],
    responsaveis: [],
    terceiros: [],
    maquinas: [],
    motivos: {},
  };

  function processar(operacao: CorpoOperacao): ResultadoOperacao {
    const { client_id, tipo } = operacao;
    const forcado = falhas.porOperacao.get(client_id);
    if (forcado) return { client_id, tipo, status: forcado, mensagem: `Forçado: ${forcado}` };

    if (operacao.tipo === 'RESPONSAVEL_CRIAR') {
      const existente = responsaveis.get(client_id);
      if (existente) {
        return { client_id, tipo, status: 'JA_SINCRONIZADO', responsavel_id: existente };
      }
      const id = proximoId++;
      responsaveis.set(client_id, id);
      return { client_id, tipo, status: 'SINCRONIZADO', responsavel_id: id };
    }

    const existente = lancamentos.get(client_id);
    if (existente) {
      return { client_id, tipo, status: 'JA_SINCRONIZADO', lancamento_id: existente };
    }

    const { responsavel_client_id: responsavel } = operacao.dados;
    if (responsavel && !responsaveis.has(responsavel)) {
      return {
        client_id,
        tipo,
        status: 'TENTAR_NOVAMENTE',
        mensagem: 'O cadastro do responsável ainda não chegou ao servidor.',
      };
    }

    const id = proximoId++;
    lancamentos.set(client_id, id);
    return { client_id, tipo, status: 'SINCRONIZADO', lancamento_id: id };
  }

  const api: PortaApi = {
    async enviarOperacoes(_dispositivo, operacoes) {
      if (falhas.sync) throw falhas.sync;
      lotes.push([...operacoes]);
      return operacoes.map(processar);
    },
    async enviarFoto(foto): Promise<ResultadoAnexo> {
      if (falhas.foto) throw falhas.foto;
      if (fotos.has(foto.client_id)) return 'JA_SINCRONIZADO';
      if (!lancamentos.has(foto.lancamento_client_id)) return 'AGUARDANDO_LANCAMENTO';
      fotos.set(foto.client_id, foto);
      return 'SINCRONIZADO';
    },
    async buscarBootstrap() {
      contagem.bootstrap += 1;
      if (falhas.bootstrap) throw falhas.bootstrap;
      return bootstrap;
    },
  };

  return {
    api,
    lancamentos,
    responsaveis,
    fotos,
    lotes,
    falhas,
    contagem,
    trocarBootstrap(novo: Bootstrap) {
      bootstrap = novo;
    },
  };
}
