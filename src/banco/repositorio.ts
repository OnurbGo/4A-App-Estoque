import type { AlteracaoAnexo, AlteracaoOperacao, AnexoPendente } from '@/regras/fila';
import type { NovaOperacao } from '@/regras/operacoes';
import type {
  Bootstrap,
  DadosLancamento,
  NomesLancamento,
  OperacaoLocal,
  StatusOperacao,
} from '@/regras/tipos';
import { criarTransacaoSerial, type BancoSql } from './banco-sql';

type LinhaOperacao = {
  seq: number;
  client_id: string;
  tipo: OperacaoLocal['tipo'];
  dados: string;
  nomes: string | null;
  status: StatusOperacao;
  tentativas: number;
  mensagem: string | null;
  id_servidor: number | null;
  criado_em: string;
  enviado_em: string | null;
  proxima_tentativa_em: string | null;
};

export type FotoNova = { client_id: string; caminho: string };

export type BootstrapLocal = { dados: Bootstrap; iniciado_em: string };

/** Só o que não é segredo: senha e token ficam no `expo-secure-store` (D2). */
export type SessaoLocal = {
  conta_id: number;
  nome: string;
  email: string;
  entrou_em: string;
};

export type ConfigAparelho = {
  endereco: string | null;
  /** `null` é a opção "Nenhum". */
  estoque_padrao_id: number | null;
};

const CHAVE_ENDERECO = 'endereco';
const CHAVE_ESTOQUE_PADRAO = 'estoque_padrao_id';
const CHAVE_ID_APARELHO = 'id_aparelho';

function paraOperacao(linha: LinhaOperacao): OperacaoLocal {
  const { dados, nomes, ...controle } = linha;

  if (linha.tipo === 'RESPONSAVEL_CRIAR') {
    const { nome } = JSON.parse(dados) as { nome: string };
    return { ...controle, tipo: 'RESPONSAVEL_CRIAR', nome };
  }

  return {
    ...controle,
    tipo: 'LANCAMENTO_CRIAR',
    dados: JSON.parse(dados) as DadosLancamento,
    nomes: JSON.parse(nomes ?? '{"responsavel":"","estoque":"","produtos":{}}') as NomesLancamento,
  };
}

export function criarRepositorio(banco: BancoSql) {
  const emTransacao = criarTransacaoSerial(banco);

  async function inserirOperacao(nova: NovaOperacao, criadoEm: string): Promise<void> {
    const dados =
      nova.tipo === 'RESPONSAVEL_CRIAR'
        ? JSON.stringify({ nome: nova.nome })
        : JSON.stringify(nova.dados);
    const nomes = nova.tipo === 'LANCAMENTO_CRIAR' ? JSON.stringify(nova.nomes) : null;

    await banco.runAsync(
      'INSERT INTO operacoes (client_id, tipo, dados, nomes, criado_em) VALUES (?, ?, ?, ?, ?)',
      [nova.client_id, nova.tipo, dados, nomes, criadoEm],
    );
  }

  async function lerConfigBruta(chave: string): Promise<string | null> {
    const [linha] = await banco.getAllAsync<{ valor: string }>(
      'SELECT valor FROM config WHERE chave = ?',
      [chave],
    );
    return linha?.valor ?? null;
  }

  async function gravarConfig(chave: string, valor: string): Promise<void> {
    await banco.runAsync(
      `INSERT INTO config (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [chave, valor],
    );
  }

  return {
    /** A operação, as fotos dela e nada pela metade. */
    enfileirar(nova: NovaOperacao, criadoEm: string, fotos: readonly FotoNova[] = []) {
      return emTransacao(async () => {
        await inserirOperacao(nova, criadoEm);
        for (const { client_id, caminho } of fotos) {
          await banco.runAsync(
            `INSERT INTO anexos_pendentes (client_id, lancamento_client_id, caminho, criado_em)
             VALUES (?, ?, ?, ?)`,
            [client_id, nova.client_id, caminho, criadoEm],
          );
        }
      });
    },

    /**
     * Tudo que o saldo, os recentes, a fila e as Pendências precisam: o que não terminou, o que
     * foi enviado depois de `desde` e os lançamentos com foto a enviar.
     */
    listarOperacoesEmAberto(desde: string | null): Promise<OperacaoLocal[]> {
      // Na fila das escritas: fora dela, a mesma conexão enxerga um lançamento ainda sem commit,
      // e o motor enviaria algo que um rollback tiraria do aparelho.
      return emTransacao(async () => {
        const linhas = await banco.getAllAsync<LinhaOperacao>(
          `SELECT * FROM operacoes
           WHERE status <> 'ENVIADO'
              OR ? IS NULL
              OR enviado_em > ?
              OR client_id IN (SELECT lancamento_client_id FROM anexos_pendentes)
           ORDER BY seq`,
          [desde, desde],
        );
        return linhas.map(paraOperacao);
      });
    },

    async buscarUltimaAplicacao(): Promise<OperacaoLocal | null> {
      const [linha] = await banco.getAllAsync<LinhaOperacao>(
        `SELECT * FROM operacoes
         WHERE tipo = 'LANCAMENTO_CRIAR' AND json_extract(dados, '$.tipo') = 'APLICACAO'
         ORDER BY seq DESC
         LIMIT 1`,
        [],
      );
      return linha ? paraOperacao(linha) : null;
    },

    aplicarAlteracoes(alteracoes: readonly AlteracaoOperacao[]) {
      return emTransacao(async () => {
        for (const alteracao of alteracoes) {
          await banco.runAsync(
            `UPDATE operacoes
             SET status = ?, tentativas = ?, mensagem = ?, id_servidor = ?, enviado_em = ?,
                 proxima_tentativa_em = ?
             WHERE client_id = ?`,
            [
              alteracao.status,
              alteracao.tentativas,
              alteracao.mensagem,
              alteracao.id_servidor,
              alteracao.enviado_em,
              alteracao.proxima_tentativa_em,
              alteracao.client_id,
            ],
          );
        }
      });
    },

    /** Ao abrir o app ou quando a conexão volta, ninguém espera: tenta tudo de novo. */
    zerarEsperas() {
      return emTransacao(async () => {
        await banco.runAsync(
          `UPDATE operacoes SET proxima_tentativa_em = NULL
           WHERE status IN ('PENDENTE', 'ERRO')`,
          [],
        );
        await banco.runAsync(
          `UPDATE anexos_pendentes SET proxima_tentativa_em = NULL WHERE status = 'PENDENTE'`,
          [],
        );
      });
    },

    listarAnexos(): Promise<AnexoPendente[]> {
      return banco.getAllAsync<AnexoPendente>(
        'SELECT * FROM anexos_pendentes ORDER BY criado_em, client_id',
        [],
      );
    },

    aplicarAlteracaoAnexo(alteracao: AlteracaoAnexo) {
      return emTransacao(async () => {
        await banco.runAsync(
          `UPDATE anexos_pendentes
           SET status = ?, tentativas = ?, mensagem = ?, proxima_tentativa_em = ?
           WHERE client_id = ?`,
          [
            alteracao.status,
            alteracao.tentativas,
            alteracao.mensagem,
            alteracao.proxima_tentativa_em,
            alteracao.client_id,
          ],
        );
      });
    },

    removerAnexo(clientId: string) {
      return emTransacao(async () => {
        await banco.runAsync('DELETE FROM anexos_pendentes WHERE client_id = ?', [clientId]);
      });
    },

    async lerBootstrap(): Promise<BootstrapLocal | null> {
      const [linha] = await banco.getAllAsync<{ dados: string; iniciado_em: string }>(
        'SELECT dados, iniciado_em FROM cache_bootstrap WHERE id = 1',
        [],
      );
      return linha
        ? { dados: JSON.parse(linha.dados) as Bootstrap, iniciado_em: linha.iniciado_em }
        : null;
    },

    /** Só o horário: o motor consulta a cada lote, sem abrir o JSON inteiro. */
    async lerInicioDoBootstrap(): Promise<string | null> {
      const [linha] = await banco.getAllAsync<{ iniciado_em: string }>(
        'SELECT iniciado_em FROM cache_bootstrap WHERE id = 1',
        [],
      );
      return linha?.iniciado_em ?? null;
    },

    salvarBootstrap(dados: Bootstrap, iniciadoEm: string) {
      return emTransacao(async () => {
        await banco.runAsync(
          `INSERT INTO cache_bootstrap (id, dados, iniciado_em) VALUES (1, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             dados = excluded.dados, iniciado_em = excluded.iniciado_em`,
          [JSON.stringify(dados), iniciadoEm],
        );
      });
    },

    limparBootstrap() {
      return emTransacao(async () => {
        await banco.runAsync('DELETE FROM cache_bootstrap', []);
      });
    },

    async lerConfig(): Promise<ConfigAparelho> {
      const [endereco, estoquePadrao] = await Promise.all([
        lerConfigBruta(CHAVE_ENDERECO),
        lerConfigBruta(CHAVE_ESTOQUE_PADRAO),
      ]);
      return {
        endereco,
        estoque_padrao_id: estoquePadrao === null ? null : Number(estoquePadrao) || null,
      };
    },

    salvarConfig({ endereco, estoque_padrao_id }: ConfigAparelho) {
      return emTransacao(async () => {
        if (endereco !== null) await gravarConfig(CHAVE_ENDERECO, endereco);
        await gravarConfig(CHAVE_ESTOQUE_PADRAO, String(estoque_padrao_id ?? 0));
      });
    },

    /** Gerado uma vez e nunca mais trocado: é o que diferencia tablets do mesmo modelo. */
    obterIdDoAparelho(gerar: () => string): Promise<string> {
      return emTransacao(async () => {
        const salvo = await lerConfigBruta(CHAVE_ID_APARELHO);
        if (salvo) return salvo;

        const novo = gerar();
        await gravarConfig(CHAVE_ID_APARELHO, novo);
        return novo;
      });
    },

    async lerSessao(): Promise<SessaoLocal | null> {
      const [linha] = await banco.getAllAsync<SessaoLocal>(
        'SELECT conta_id, nome, email, entrou_em FROM sessao WHERE id = 1',
        [],
      );
      return linha ?? null;
    },

    salvarSessao({ conta_id, nome, email, entrou_em }: SessaoLocal) {
      return emTransacao(async () => {
        await banco.runAsync(
          `INSERT INTO sessao (id, conta_id, nome, email, entrou_em) VALUES (1, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             conta_id = excluded.conta_id, nome = excluded.nome,
             email = excluded.email, entrou_em = excluded.entrou_em`,
          [conta_id, nome, email, entrou_em],
        );
      });
    },

    /** Sair da conta não apaga fila, bootstrap nem `config`. */
    limparSessao() {
      return emTransacao(async () => {
        await banco.runAsync('DELETE FROM sessao', []);
      });
    },
  };
}

export type Repositorio = ReturnType<typeof criarRepositorio>;
