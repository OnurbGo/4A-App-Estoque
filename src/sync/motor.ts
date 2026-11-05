import type { Repositorio } from '@/banco';
import {
  bootstrapVencido,
  podeEnviar,
  registrarFalhaGeral,
  SEM_ESPERA,
  zeraEspera,
  type EsperaGeral,
  type Gatilho,
} from '@/regras/agendamento';
import {
  aplicarResultadoAnexo,
  aplicarResultados,
  escolherAnexos,
  escolherLote,
  fotoRecusadaPeloServidor,
  recusarAnexo,
  type ResultadoAnexo,
  type ResultadoOperacao,
} from '@/regras/fila';
import { corpoDaOperacao, type CorpoOperacao } from '@/regras/operacoes';
import type { Bootstrap } from '@/regras/tipos';
import { ApiError, toFriendlyError } from '@/services/errors';
import type { FotoParaEnvio } from '@/services/tablet-api';

const FOTO_SUMIU = 'O arquivo da foto não foi encontrado no aparelho.';

export type PortaApi = {
  enviarOperacoes(
    dispositivo: string,
    operacoes: readonly CorpoOperacao[],
  ): Promise<ResultadoOperacao[]>;
  enviarFoto(foto: FotoParaEnvio): Promise<ResultadoAnexo>;
  buscarBootstrap(): Promise<Bootstrap>;
};

export type PortaArquivos = {
  existe(caminho: string): boolean;
  apagar(caminho: string): void;
};

export type DependenciasDoMotor = {
  repositorio: Repositorio;
  api: PortaApi;
  arquivos: PortaArquivos;
  nomeDoDispositivo: () => Promise<string>;
  agora: () => Date;
  aoTerminarRodada?: (falha: ApiError | null) => void;
};

type Pedido = { gatilho: Gatilho; conectado: boolean };

/**
 * Envia a fila, depois as fotos, depois atualiza o bootstrap, nessa ordem e uma rodada por vez.
 * Um gatilho que chega no meio da rodada roda em seguida. O motor nunca lança erro: falha geral
 * vira espera, e a fila continua guardada no banco.
 */
export function criarMotor({
  repositorio,
  api,
  arquivos,
  nomeDoDispositivo,
  agora,
  aoTerminarRodada,
}: DependenciasDoMotor) {
  let espera: EsperaGeral = SEM_ESPERA;
  let rodando: Promise<void> | null = null;
  let proximo: Pedido | null = null;

  async function enviarOperacoes(): Promise<boolean> {
    const dispositivo = await nomeDoDispositivo();
    let enviou = false;

    // Termina: toda operação do lote sai da fila ou ganha uma espera no futuro.
    for (;;) {
      const inicio = await repositorio.lerInicioDoBootstrap();
      const operacoes = await repositorio.listarOperacoesEmAberto(inicio);
      const lote = escolherLote(operacoes, agora());
      if (lote.length === 0) return enviou;

      const resultados = await api.enviarOperacoes(dispositivo, lote.map(corpoDaOperacao));
      const alteracoes = aplicarResultados(lote, resultados, agora());
      await repositorio.aplicarAlteracoes(alteracoes);

      enviou ||= alteracoes.some(({ status }) => status === 'ENVIADO');
    }
  }

  async function enviarFotos(): Promise<void> {
    const inicio = await repositorio.lerInicioDoBootstrap();
    const [operacoes, anexos] = await Promise.all([
      repositorio.listarOperacoesEmAberto(inicio),
      repositorio.listarAnexos(),
    ]);

    for (const anexo of escolherAnexos(anexos, operacoes, agora())) {
      if (!arquivos.existe(anexo.caminho)) {
        await repositorio.aplicarAlteracaoAnexo(recusarAnexo(anexo, FOTO_SUMIU));
        continue;
      }

      try {
        const resultado = await api.enviarFoto(anexo);
        const alteracao = aplicarResultadoAnexo(anexo, resultado, agora());
        if (alteracao) {
          await repositorio.aplicarAlteracaoAnexo(alteracao);
        } else {
          // Nessa ordem: se o app cair aqui, sobra um arquivo solto, nunca um registro sem foto.
          await repositorio.removerAnexo(anexo.client_id);
          arquivos.apagar(anexo.caminho);
        }
      } catch (erro) {
        const falha = toFriendlyError(erro);
        if (!fotoRecusadaPeloServidor(falha.statusCode)) throw falha;
        await repositorio.aplicarAlteracaoAnexo(recusarAnexo(anexo, falha.message));
      }
    }
  }

  async function atualizarBootstrap(enviou: boolean): Promise<void> {
    const ultimoInicio = await repositorio.lerInicioDoBootstrap();
    if (!enviou && !bootstrapVencido(ultimoInicio, agora())) return;

    // Antes do pedido: o que for enviado depois daqui ainda conta no saldo local.
    const inicio = agora().toISOString();
    const dados = await api.buscarBootstrap();
    await repositorio.salvarBootstrap(dados, inicio);
  }

  async function rodada({ gatilho, conectado }: Pedido): Promise<void> {
    let falha: ApiError | null = null;

    try {
      if (zeraEspera(gatilho)) {
        espera = SEM_ESPERA;
        await repositorio.zerarEsperas();
      }
      if (!podeEnviar(gatilho, espera, conectado, agora())) return;

      const enviou = await enviarOperacoes();
      await enviarFotos();
      await atualizarBootstrap(enviou);
      espera = SEM_ESPERA;
    } catch (erro) {
      falha = toFriendlyError(erro);
      espera = registrarFalhaGeral(espera, agora());
    }

    aoTerminarRodada?.(falha);
  }

  function disparar(gatilho: Gatilho, conectado: boolean): Promise<void> {
    if (rodando) {
      proximo = { gatilho, conectado };
      return rodando;
    }

    rodando = (async () => {
      let pedido: Pedido | null = { gatilho, conectado };
      while (pedido) {
        proximo = null;
        await rodada(pedido);
        pedido = proximo;
      }
    })().finally(() => {
      rodando = null;
    });

    return rodando;
  }

  return { disparar };
}

export type Motor = ReturnType<typeof criarMotor>;
