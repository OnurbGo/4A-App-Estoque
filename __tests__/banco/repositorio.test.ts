import { criarTransacaoSerial, type BancoSql } from '@/banco/banco-sql';
import { migrar, MIGRACOES } from '@/banco/migracoes';
import { criarRepositorio, type Repositorio } from '@/banco/repositorio';
import type { NovaOperacao } from '@/regras/operacoes';
import type { Bootstrap, OperacaoLancamento } from '@/regras/tipos';
import { bancoEmMemoria, repositorioEmMemoria } from './sqljs';

const CRIADO_EM = '2026-11-05T12:00:00.000Z';

const novoLancamento = (client_id: string, tipo: 'SAIDA' | 'APLICACAO' = 'SAIDA'): NovaOperacao => ({
  tipo: 'LANCAMENTO_CRIAR',
  client_id,
  dados: {
    tipo,
    estoque_id: 1,
    responsavel_id: 7,
    ocorrido_em: CRIADO_EM,
    itens: [{ produto_id: 10, quantidade: 2.5 }],
  },
  nomes: { responsavel: 'Carlos', estoque: 'Casinha', produtos: { 10: 'Verdict' } },
});

const novoResponsavel = (client_id: string, nome: string): NovaOperacao => ({
  tipo: 'RESPONSAVEL_CRIAR',
  client_id,
  nome,
});

const bootstrap: Bootstrap = {
  estoques: [{ id_almox_estoque: 1, nome: 'Casinha', grupo: 'INSUMOS' }],
  produtos: [],
  produtos_por_estoque: [],
  responsaveis: [],
  terceiros: [],
  maquinas: [],
  motivos: { SAIDA: ['EMPRESTIMO', 'OUTROS'] },
};

const enviado = (client_id: string, enviado_em = '2026-11-05T12:30:00.000Z') => ({
  client_id,
  status: 'ENVIADO' as const,
  tentativas: 1,
  mensagem: null,
  id_servidor: 42,
  enviado_em,
  proxima_tentativa_em: null,
});

let repositorio: Repositorio;
let banco: Awaited<ReturnType<typeof bancoEmMemoria>>;

beforeEach(async () => {
  ({ repositorio, banco } = await repositorioEmMemoria());
});

describe('migrações', () => {
  it('cria todas as tabelas do plano', async () => {
    const tabelas = await banco.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      [],
    );

    expect(tabelas.map(({ name }) => name).sort()).toEqual([
      'anexos_pendentes',
      'cache_bootstrap',
      'config',
      'operacoes',
      'sessao',
    ]);
  });

  it('não refaz o que já rodou e não perde a fila', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);

    await migrar(banco);

    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
  });

  it('aplica só as versões novas', async () => {
    await migrar(banco, [...MIGRACOES, 'CREATE TABLE teste_nova (id INTEGER PRIMARY KEY);']);

    const [{ user_version: versao }] = (await banco.getAllAsync<{ user_version: number }>(
      'PRAGMA user_version',
      [],
    )) as [{ user_version: number }];

    expect(versao).toBe(MIGRACOES.length + 1);
  });

  it('migração que falha não deixa nada pela metade', async () => {
    const ruim = 'CREATE TABLE parcial (id INTEGER); INSERT INTO nao_existe VALUES (1);';

    await expect(migrar(banco, [...MIGRACOES, ruim])).rejects.toThrow();

    const tabelas = await banco.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE name = 'parcial'`,
      [],
    );
    expect(tabelas).toEqual([]);
  });

  it('o status só aceita os quatro valores do plano', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);

    await expect(
      banco.runAsync(`UPDATE operacoes SET status = 'OUTRO' WHERE client_id = 'a'`, []),
    ).rejects.toThrow();
  });
});

describe('fila', () => {
  it('guarda a ordem de criação, mesmo com o relógio voltando', async () => {
    await repositorio.enfileirar(novoLancamento('a'), '2026-11-05T15:00:00.000Z');
    await repositorio.enfileirar(novoResponsavel('b', 'Ana'), '2026-11-05T09:00:00.000Z');

    const operacoes = await repositorio.listarOperacoesEmAberto(null);

    expect(operacoes.map(({ client_id }) => client_id)).toEqual(['a', 'b']);
  });

  it('devolve o lançamento como foi gravado, com os nomes', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);

    const [operacao] = (await repositorio.listarOperacoesEmAberto(null)) as OperacaoLancamento[];

    expect(operacao).toMatchObject({
      client_id: 'a',
      status: 'PENDENTE',
      tentativas: 0,
      criado_em: CRIADO_EM,
      dados: { tipo: 'SAIDA', itens: [{ produto_id: 10, quantidade: 2.5 }] },
      nomes: { responsavel: 'Carlos', produtos: { 10: 'Verdict' } },
    });
  });

  it('devolve o cadastro de responsável', async () => {
    await repositorio.enfileirar(novoResponsavel('a', 'Ana'), CRIADO_EM);

    expect((await repositorio.listarOperacoesEmAberto(null))[0]).toMatchObject({
      tipo: 'RESPONSAVEL_CRIAR',
      nome: 'Ana',
    });
  });

  it('os nomes ficam fora de `dados`, que é o que vai para o servidor', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);

    const [linha] = (await banco.getAllAsync<{ dados: string }>(
      'SELECT dados FROM operacoes',
      [],
    )) as [{ dados: string }];

    expect(linha.dados).not.toContain('Carlos');
  });

  it('não aceita client_id repetido', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);

    await expect(repositorio.enfileirar(novoLancamento('a'), CRIADO_EM)).rejects.toThrow();

    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
  });

  it('grava lançamento e fotos juntos', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM, [
      { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
    ]);

    expect(await repositorio.listarAnexos()).toEqual([
      expect.objectContaining({
        client_id: 'foto-1',
        lancamento_client_id: 'a',
        status: 'PENDENTE',
      }),
    ]);
  });

  it('foto que falha desfaz o lançamento: nada fica pela metade', async () => {
    await expect(
      repositorio.enfileirar(novoLancamento('a'), CRIADO_EM, [
        { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
        { client_id: 'foto-1', caminho: 'file:///repetida.jpg' },
      ]),
    ).rejects.toThrow();

    expect(await repositorio.listarOperacoesEmAberto(null)).toEqual([]);
    expect(await repositorio.listarAnexos()).toEqual([]);
  });

  it('aplica as alterações do envio', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);
    await repositorio.enfileirar(novoLancamento('b'), CRIADO_EM);

    await repositorio.aplicarAlteracoes([
      enviado('a'),
      {
        client_id: 'b',
        status: 'ERRO',
        tentativas: 1,
        mensagem: 'Repita.',
        id_servidor: null,
        enviado_em: null,
        proxima_tentativa_em: '2026-11-05T12:31:00.000Z',
      },
    ]);

    const operacoes = await repositorio.listarOperacoesEmAberto(null);
    expect(operacoes[0]).toMatchObject({ status: 'ENVIADO', id_servidor: 42 });
    expect(operacoes[1]).toMatchObject({
      status: 'ERRO',
      mensagem: 'Repita.',
      proxima_tentativa_em: '2026-11-05T12:31:00.000Z',
    });
  });

  it('zera as esperas sem mexer no que já terminou', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM, [
      { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
    ]);
    await repositorio.aplicarAlteracoes([
      {
        client_id: 'a',
        status: 'ERRO',
        tentativas: 4,
        mensagem: 'Repita.',
        id_servidor: null,
        enviado_em: null,
        proxima_tentativa_em: '2026-11-05T12:31:00.000Z',
      },
    ]);
    await repositorio.aplicarAlteracaoAnexo({
      client_id: 'foto-1',
      status: 'PENDENTE',
      tentativas: 1,
      mensagem: null,
      proxima_tentativa_em: '2026-11-05T12:31:00.000Z',
    });

    await repositorio.zerarEsperas();

    expect((await repositorio.listarOperacoesEmAberto(null))[0]).toMatchObject({
      status: 'ERRO',
      tentativas: 4,
      proxima_tentativa_em: null,
    });
    expect((await repositorio.listarAnexos())[0]?.proxima_tentativa_em).toBeNull();
  });

  describe('o que continua em aberto', () => {
    const inicioBootstrap = '2026-11-05T12:10:00.000Z';

    it('o enviado antes do bootstrap sai, o enviado depois fica', async () => {
      await repositorio.enfileirar(novoLancamento('antes'), CRIADO_EM);
      await repositorio.enfileirar(novoLancamento('depois'), CRIADO_EM);
      await repositorio.aplicarAlteracoes([
        enviado('antes', '2026-11-05T12:05:00.000Z'),
        enviado('depois', '2026-11-05T12:15:00.000Z'),
      ]);

      const operacoes = await repositorio.listarOperacoesEmAberto(inicioBootstrap);

      expect(operacoes.map(({ client_id }) => client_id)).toEqual(['depois']);
    });

    it('sem bootstrap, tudo fica', async () => {
      await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);
      await repositorio.aplicarAlteracoes([enviado('a', '2026-11-05T12:05:00.000Z')]);

      expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
    });

    it('o recusado fica para aparecer em Pendências', async () => {
      await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);
      await repositorio.aplicarAlteracoes([
        {
          client_id: 'a',
          status: 'RECUSADO',
          tentativas: 1,
          mensagem: 'Não.',
          id_servidor: null,
          enviado_em: null,
          proxima_tentativa_em: null,
        },
      ]);

      expect(await repositorio.listarOperacoesEmAberto(inicioBootstrap)).toHaveLength(1);
    });

    it('o enviado com foto a enviar fica, para a foto saber que pode subir', async () => {
      await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM, [
        { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
      ]);
      await repositorio.aplicarAlteracoes([enviado('a', '2026-11-05T12:05:00.000Z')]);

      expect(await repositorio.listarOperacoesEmAberto(inicioBootstrap)).toHaveLength(1);

      await repositorio.removerAnexo('foto-1');

      expect(await repositorio.listarOperacoesEmAberto(inicioBootstrap)).toEqual([]);
    });
  });

  it('acha a última aplicação, mesmo já enviada', async () => {
    await repositorio.enfileirar(novoLancamento('a', 'APLICACAO'), CRIADO_EM);
    await repositorio.enfileirar(novoLancamento('b', 'APLICACAO'), CRIADO_EM);
    await repositorio.enfileirar(novoLancamento('c', 'SAIDA'), CRIADO_EM);
    await repositorio.aplicarAlteracoes([enviado('b')]);

    expect((await repositorio.buscarUltimaAplicacao())?.client_id).toBe('b');
  });

  it('sem aplicação, não acha nada', async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);

    expect(await repositorio.buscarUltimaAplicacao()).toBeNull();
  });
});

describe('escritas ao mesmo tempo', () => {
  it('um lançamento confirmado durante um envio que falha não se perde', async () => {
    const emTransacao = criarTransacaoSerial(banco);

    const envioQueFalha = emTransacao(async () => {
      await banco.runAsync(
        `INSERT INTO config (chave, valor) VALUES ('durante_envio', '1')`,
        [],
      );
      await Promise.resolve();
      throw new Error('Falhou no meio.');
    });
    const lancamento = emTransacao(() =>
      banco
        .runAsync(`INSERT INTO config (chave, valor) VALUES ('lancamento', '1')`, [])
        .then(() => undefined),
    );

    await expect(envioQueFalha).rejects.toThrow('Falhou no meio.');
    await lancamento;

    const chaves = await banco.getAllAsync<{ chave: string }>('SELECT chave FROM config', []);
    expect(chaves).toEqual([{ chave: 'lancamento' }]);
  });

  it('a fila não enxerga um lançamento que ainda pode ser desfeito', async () => {
    const lento: BancoSql = {
      ...banco,
      runAsync: async (sql, parametros) => {
        const resultado = await banco.runAsync(sql, parametros);
        await new Promise((resolver) => setTimeout(resolver, 5));
        return resultado;
      },
    };
    const repositorioLento = criarRepositorio(lento);

    const desfeito = expect(
      repositorioLento.enfileirar(novoLancamento('a'), CRIADO_EM, [
        { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
        { client_id: 'foto-1', caminho: 'file:///repetida.jpg' },
      ]),
    ).rejects.toThrow();
    await new Promise((resolver) => setTimeout(resolver, 2));

    const lidas = await repositorioLento.listarOperacoesEmAberto(null);

    await desfeito;
    expect(lidas).toEqual([]);
  });

  it('roda na ordem em que foi pedido', async () => {
    const emTransacao = criarTransacaoSerial(banco);
    const ordem: number[] = [];

    await Promise.all([
      emTransacao(async () => {
        await Promise.resolve();
        ordem.push(1);
      }),
      emTransacao(async () => {
        ordem.push(2);
      }),
    ]);

    expect(ordem).toEqual([1, 2]);
  });

  it('devolve o resultado da tarefa', async () => {
    const emTransacao = criarTransacaoSerial(banco);

    await expect(emTransacao(async () => 7)).resolves.toBe(7);
  });

  it('o repositório aguenta envios e lançamentos misturados', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => repositorio.enfileirar(novoLancamento(`l${i}`), CRIADO_EM)),
    );

    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(20);
  });
});

describe('fotos', () => {
  beforeEach(async () => {
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM, [
      { client_id: 'foto-1', caminho: 'file:///foto-1.jpg' },
    ]);
  });

  it('guarda a recusa', async () => {
    await repositorio.aplicarAlteracaoAnexo({
      client_id: 'foto-1',
      status: 'RECUSADO',
      tentativas: 1,
      mensagem: 'A foto deve ter até 5 MB.',
      proxima_tentativa_em: null,
    });

    expect((await repositorio.listarAnexos())[0]).toMatchObject({
      status: 'RECUSADO',
      mensagem: 'A foto deve ter até 5 MB.',
    });
  });

  it('sai depois de enviada', async () => {
    await repositorio.removerAnexo('foto-1');

    expect(await repositorio.listarAnexos()).toEqual([]);
  });

  it('não existe foto sem lançamento', async () => {
    await expect(
      banco.runAsync(
        `INSERT INTO anexos_pendentes (client_id, lancamento_client_id, caminho, criado_em)
         VALUES ('foto-2', 'nao-existe', 'x', 'y')`,
        [],
      ),
    ).rejects.toThrow();
  });
});

describe('bootstrap', () => {
  it('começa vazio', async () => {
    expect(await repositorio.lerBootstrap()).toBeNull();
  });

  it('guarda e troca, ficando só o último', async () => {
    await repositorio.salvarBootstrap(bootstrap, CRIADO_EM);
    await repositorio.salvarBootstrap({ ...bootstrap, terceiros: [] }, '2026-11-05T13:00:00.000Z');

    expect(await repositorio.lerBootstrap()).toEqual({
      dados: bootstrap,
      iniciado_em: '2026-11-05T13:00:00.000Z',
    });
  });

  it('pode ser limpo', async () => {
    await repositorio.salvarBootstrap(bootstrap, CRIADO_EM);

    await repositorio.limparBootstrap();

    expect(await repositorio.lerBootstrap()).toBeNull();
  });
});

describe('config', () => {
  it('sem nada salvo, não há endereço padrão', async () => {
    expect(await repositorio.lerConfig()).toEqual({ endereco: null, estoque_padrao_id: null });
  });

  it('guarda endereço e estoque padrão', async () => {
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 3 });

    expect(await repositorio.lerConfig()).toEqual({
      endereco: '192.168.0.10',
      estoque_padrao_id: 3,
    });
  });

  it('guarda a opção Nenhum', async () => {
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 3 });
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: null });

    expect((await repositorio.lerConfig()).estoque_padrao_id).toBeNull();
  });

  it('o id do aparelho é gerado uma vez só', async () => {
    const gerar = jest.fn(() => 'id-1');

    expect(await repositorio.obterIdDoAparelho(gerar)).toBe('id-1');
    expect(await repositorio.obterIdDoAparelho(gerar)).toBe('id-1');
    expect(gerar).toHaveBeenCalledTimes(1);
  });
});

describe('sair da conta', () => {
  const sessao = {
    conta_id: 1,
    nome: 'Tablets',
    email: 'tablets@example.com',
    entrou_em: CRIADO_EM,
  };

  it('guarda só dados que não são segredo', async () => {
    await repositorio.salvarSessao(sessao);

    expect(await repositorio.lerSessao()).toEqual(sessao);
    const colunas = await banco.getAllAsync<{ name: string }>('PRAGMA table_info(sessao)', []);
    expect(colunas.map(({ name }) => name).join()).not.toMatch(/senha|token/i);
  });

  it('atualiza a sessão existente', async () => {
    await repositorio.salvarSessao(sessao);
    await repositorio.salvarSessao({ ...sessao, nome: 'Tablets 2' });

    expect((await repositorio.lerSessao())?.nome).toBe('Tablets 2');
  });

  it('não pede de novo o endereço nem o estoque, e não perde fila nem bootstrap', async () => {
    await repositorio.salvarConfig({ endereco: '192.168.0.10', estoque_padrao_id: 3 });
    await repositorio.enfileirar(novoLancamento('a'), CRIADO_EM);
    await repositorio.salvarBootstrap(bootstrap, CRIADO_EM);
    await repositorio.salvarSessao(sessao);

    await repositorio.limparSessao();

    expect(await repositorio.lerSessao()).toBeNull();
    expect(await repositorio.lerConfig()).toEqual({
      endereco: '192.168.0.10',
      estoque_padrao_id: 3,
    });
    expect(await repositorio.listarOperacoesEmAberto(null)).toHaveLength(1);
    expect(await repositorio.lerBootstrap()).not.toBeNull();
  });
});
