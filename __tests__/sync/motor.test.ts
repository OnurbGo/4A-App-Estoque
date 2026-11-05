import type { Repositorio } from '@/banco';
import { montarPendencias } from '@/regras/pendencias';
import type { NovaOperacao } from '@/regras/operacoes';
import { calcularSaldos, saldoDe } from '@/regras/saldo-local';
import type { Bootstrap } from '@/regras/tipos';
import { ApiError } from '@/services/errors';
import { criarMotor, type Motor } from '@/sync/motor';
import { repositorioEmMemoria } from '../banco/sqljs';
import { servidorDoTablet } from './servidor-do-tablet';

const MINUTO = 60_000;
const SEM_REDE = new ApiError(0, 'Sem conexão com o servidor.');

const lancamento = (client_id: string, extra: Record<string, unknown> = {}): NovaOperacao => ({
  tipo: 'LANCAMENTO_CRIAR',
  client_id,
  dados: {
    tipo: 'SAIDA',
    motivo: 'OUTROS',
    motivo_texto: 'Uso interno',
    estoque_id: 1,
    responsavel_id: 7,
    ocorrido_em: '2026-11-05T12:00:00.000Z',
    itens: [{ produto_id: 10, quantidade: 2 }],
    ...extra,
  },
  nomes: { responsavel: 'Carlos', estoque: 'Casinha', produtos: { 10: 'Verdict' } },
});

const responsavel = (client_id: string, nome: string): NovaOperacao => ({
  tipo: 'RESPONSAVEL_CRIAR',
  client_id,
  nome,
});

const bootstrapCom = (saldo: number): Bootstrap => ({
  estoques: [{ id_almox_estoque: 1, nome: 'Casinha', grupo: 'INSUMOS' }],
  produtos: [{ id_almox_produto: 10, nome: 'Verdict', unidade: 'L' }],
  produtos_por_estoque: [
    { estoque_id: 1, produtos: [{ produto_id: 10, saldo }], recentes: [10] },
  ],
  responsaveis: [],
  terceiros: [],
  maquinas: [],
  motivos: {},
});

let repositorio: Repositorio;
let servidor: ReturnType<typeof servidorDoTablet>;
let motor: Motor;
let agora: Date;
let arquivos: Set<string>;
let rodadas: (ApiError | null)[];

const passar = (minutos: number) => {
  agora = new Date(agora.getTime() + minutos * MINUTO);
};

const emFila = async (...novas: NovaOperacao[]) => {
  for (const nova of novas) await repositorio.enfileirar(nova, agora.toISOString());
};

const comFoto = async (nova: NovaOperacao, fotoId: string) => {
  const caminho = `file:///anexos/${fotoId}.jpg`;
  arquivos.add(caminho);
  await repositorio.enfileirar(nova, agora.toISOString(), [{ client_id: fotoId, caminho }]);
};

const operacoes = () => repositorio.listarOperacoesEmAberto(null);

const statusDe = async (clientId: string) =>
  (await operacoes()).find(({ client_id }) => client_id === clientId)?.status;

beforeEach(async () => {
  ({ repositorio } = await repositorioEmMemoria());
  servidor = servidorDoTablet();
  servidor.trocarBootstrap(bootstrapCom(13));
  agora = new Date('2026-11-05T12:00:00.000Z');
  arquivos = new Set();
  rodadas = [];
  motor = criarMotor({
    repositorio,
    api: servidor.api,
    arquivos: {
      existe: (caminho) => arquivos.has(caminho),
      apagar: (caminho) => {
        arquivos.delete(caminho);
      },
    },
    nomeDoDispositivo: async () => 'SM-T220 abc123',
    agora: () => agora,
    aoTerminarRodada: (falha) => rodadas.push(falha),
  });
});

describe('envio da fila', () => {
  it('envia e marca como ENVIADO', async () => {
    await emFila(lancamento('a'));

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('a')).toBe('ENVIADO');
    expect(servidor.lancamentos.has('a')).toBe(true);
  });

  it('envia na ordem de criação', async () => {
    await emFila(lancamento('c'), responsavel('a', 'Ana'), lancamento('b'));

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.lotes[0]?.map(({ client_id }) => client_id)).toEqual(['c', 'a', 'b']);
  });

  it('divide em lotes de até 50 e manda tudo', async () => {
    await emFila(...Array.from({ length: 120 }, (_, i) => lancamento(`l${i}`)));

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.lotes.map((lote) => lote.length)).toEqual([50, 50, 20]);
    expect(servidor.lancamentos.size).toBe(120);
    expect(servidor.lotes[1]?.[0]?.client_id).toBe('l50');
  });

  it('não manda os nomes para o servidor', async () => {
    await emFila(lancamento('a'));

    await motor.disparar('LANCAMENTO', true);

    expect(JSON.stringify(servidor.lotes)).not.toContain('Carlos');
  });

  it('o responsável e o lançamento dele vão no mesmo lote, em ordem', async () => {
    await emFila(
      responsavel('r', 'Ana'),
      lancamento('a', { responsavel_id: undefined, responsavel_client_id: 'r' }),
    );

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('r')).toBe('ENVIADO');
    expect(await statusDe('a')).toBe('ENVIADO');
  });

  it('sem nada na fila, não chama o servidor', async () => {
    await motor.disparar('TIMER', true);

    expect(servidor.lotes).toEqual([]);
  });
});

describe('os quatro status da A.6', () => {
  it('RECUSADO sai da fila e não é reenviado', async () => {
    await emFila(lancamento('a'));
    servidor.falhas.porOperacao.set('a', 'RECUSADO');

    await motor.disparar('LANCAMENTO', true);
    passar(60);
    await motor.disparar('TIMER', true);

    expect(await statusDe('a')).toBe('RECUSADO');
    expect(servidor.lotes).toHaveLength(1);
  });

  it('TENTAR_NOVAMENTE fica na fila e sai quando o servidor aceitar', async () => {
    await emFila(lancamento('a'));
    servidor.falhas.porOperacao.set('a', 'TENTAR_NOVAMENTE');

    await motor.disparar('LANCAMENTO', true);
    expect(await statusDe('a')).toBe('ERRO');

    servidor.falhas.porOperacao.clear();
    passar(1);
    await motor.disparar('TIMER', true);

    expect(await statusDe('a')).toBe('ENVIADO');
    expect(servidor.lancamentos.size).toBe(1);
  });

  it('TENTAR_NOVAMENTE espera a vez dele', async () => {
    await emFila(lancamento('a'));
    servidor.falhas.porOperacao.set('a', 'TENTAR_NOVAMENTE');

    await motor.disparar('LANCAMENTO', true);
    await motor.disparar('TIMER', true);

    expect(servidor.lotes).toHaveLength(1);
  });

  it('operação presa em TENTAR_NOVAMENTE aparece em Pendências', async () => {
    await emFila(lancamento('a'));
    servidor.falhas.porOperacao.set('a', 'TENTAR_NOVAMENTE');

    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      await motor.disparar('TIMER', true);
      passar(10);
    }

    const [item] = montarPendencias(await operacoes(), []);
    expect(item).toMatchObject({ id: 'a', situacao: 'PRESA', tentativas: 3 });
  });

  it('lançamento de responsável recusado fica aguardando e aparece como preso (D23)', async () => {
    await emFila(
      responsavel('r', 'Nome ruim'),
      lancamento('a', { responsavel_id: undefined, responsavel_client_id: 'r' }),
    );
    servidor.falhas.porOperacao.set('r', 'RECUSADO');

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('r')).toBe('RECUSADO');
    expect(await statusDe('a')).toBe('ERRO');
    expect(servidor.lancamentos.size).toBe(0);

    const item = montarPendencias(await operacoes(), []).find(({ id }) => id === 'a');
    expect(item?.situacao).toBe('PRESA');
    expect(item?.orientacao).toMatch(/Nome ruim foi recusado/);
  });

  it('operações presas no início não travam as seguintes', async () => {
    await emFila(...Array.from({ length: 50 }, (_, i) => lancamento(`presa${i}`)));
    for (let i = 0; i < 50; i += 1) servidor.falhas.porOperacao.set(`presa${i}`, 'TENTAR_NOVAMENTE');
    await motor.disparar('TIMER', true);
    await emFila(lancamento('nova'));

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('nova')).toBe('ENVIADO');
  });

  it('uma recusa não afeta as outras do lote', async () => {
    await emFila(lancamento('a'), lancamento('b'), lancamento('c'));
    servidor.falhas.porOperacao.set('b', 'RECUSADO');

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('a')).toBe('ENVIADO');
    expect(await statusDe('b')).toBe('RECUSADO');
    expect(await statusDe('c')).toBe('ENVIADO');
  });
});

describe('reenvio e idempotência', () => {
  it('falha de rede não mexe na fila', async () => {
    await emFila(lancamento('a'));
    servidor.falhas.sync = SEM_REDE;

    await motor.disparar('LANCAMENTO', true);

    expect((await operacoes())[0]).toMatchObject({ status: 'PENDENTE', tentativas: 0 });
    expect(rodadas).toEqual([SEM_REDE]);
  });

  it('chega uma vez só se a resposta se perdeu depois de o servidor gravar', async () => {
    await emFila(lancamento('a'));
    const aplicar = repositorio.aplicarAlteracoes;
    repositorio.aplicarAlteracoes = jest.fn().mockRejectedValueOnce(new Error('App caiu'));

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.lancamentos.size).toBe(1);
    expect(await statusDe('a')).toBe('PENDENTE');

    repositorio.aplicarAlteracoes = aplicar;
    passar(1);
    await motor.disparar('TIMER', true);

    expect(await statusDe('a')).toBe('ENVIADO');
    expect(servidor.lancamentos.size).toBe(1);
    expect(servidor.lotes).toHaveLength(2);
  });
});

describe('backoff em erro de rede', () => {
  beforeEach(async () => {
    await emFila(lancamento('a'));
    servidor.falhas.sync = SEM_REDE;
    await motor.disparar('TIMER', true);
  });

  const tentativasAteEnviar = async () => {
    servidor.falhas.sync = null;
    await motor.disparar('TIMER', true);
    return statusDe('a');
  };

  it('espera 1 min depois da primeira falha', async () => {
    passar(0.9);
    expect(await tentativasAteEnviar()).toBe('PENDENTE');

    passar(0.1);
    expect(await tentativasAteEnviar()).toBe('ENVIADO');
  });

  it('a espera cresce: 1, 2, 5 e 10 min', async () => {
    for (const minutos of [1, 2, 5]) {
      passar(minutos);
      await motor.disparar('TIMER', true);
    }
    expect(rodadas).toHaveLength(4);

    passar(9.9);
    await motor.disparar('TIMER', true);
    expect(rodadas).toHaveLength(4);

    passar(0.1);
    await motor.disparar('TIMER', true);
    expect(rodadas).toHaveLength(5);
  });

  it('lançamento novo respeita a espera', async () => {
    await emFila(lancamento('b'));
    servidor.falhas.sync = null;

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('b')).toBe('PENDENTE');
  });

  it.each(['CONEXAO_VOLTOU', 'ABRIR'] as const)('%s zera a espera e envia na hora', async (gatilho) => {
    servidor.falhas.sync = null;

    await motor.disparar(gatilho, true);

    expect(await statusDe('a')).toBe('ENVIADO');
  });

  it('um envio certo zera a espera', async () => {
    passar(1);
    servidor.falhas.sync = null;
    await motor.disparar('TIMER', true);
    await emFila(lancamento('b'));
    servidor.falhas.sync = SEM_REDE;
    await motor.disparar('LANCAMENTO', true);

    passar(1);
    servidor.falhas.sync = null;
    await motor.disparar('TIMER', true);

    expect(await statusDe('b')).toBe('ENVIADO');
  });

  it('sem conexão, nem tenta', async () => {
    const lotes = servidor.lotes.length;
    servidor.falhas.sync = null;
    passar(60);

    await motor.disparar('ABRIR', false);

    expect(servidor.lotes).toHaveLength(lotes);
    expect(await statusDe('a')).toBe('PENDENTE');
  });

  it('abrir o app sem rede ainda libera quem estava esperando', async () => {
    await emFila(lancamento('b'));
    servidor.falhas.sync = null;
    servidor.falhas.porOperacao.set('b', 'TENTAR_NOVAMENTE');
    await motor.disparar('CONEXAO_VOLTOU', true);
    expect((await operacoes()).find(({ client_id }) => client_id === 'b')?.proxima_tentativa_em).not.toBeNull();

    await motor.disparar('ABRIR', false);

    expect((await operacoes()).find(({ client_id }) => client_id === 'b')?.proxima_tentativa_em).toBeNull();
  });
});

describe('fotos', () => {
  it('só sobe depois do lançamento', async () => {
    await comFoto(lancamento('a'), 'foto-1');

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.fotos.get('foto-1')).toMatchObject({ lancamento_client_id: 'a' });
    expect(await repositorio.listarAnexos()).toEqual([]);
  });

  it('não sobe com o lançamento preso na fila', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    servidor.falhas.porOperacao.set('a', 'TENTAR_NOVAMENTE');

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.fotos.size).toBe(0);
    expect(await repositorio.listarAnexos()).toHaveLength(1);
  });

  it('não sobe com o lançamento recusado', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    servidor.falhas.porOperacao.set('a', 'RECUSADO');

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.fotos.size).toBe(0);
    expect(arquivos.size).toBe(1);
  });

  it('apaga o arquivo depois de enviar', async () => {
    await comFoto(lancamento('a'), 'foto-1');

    await motor.disparar('LANCAMENTO', true);

    expect(arquivos.size).toBe(0);
  });

  it('AGUARDANDO_LANCAMENTO mantém a foto e tenta de novo', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    await repositorio.aplicarAlteracoes([
      {
        client_id: 'a',
        status: 'ENVIADO',
        tentativas: 1,
        mensagem: null,
        id_servidor: 1,
        enviado_em: agora.toISOString(),
        proxima_tentativa_em: null,
      },
    ]);

    await motor.disparar('TIMER', true);

    expect((await repositorio.listarAnexos())[0]).toMatchObject({
      status: 'PENDENTE',
      tentativas: 1,
    });
    expect(arquivos.size).toBe(1);

    servidor.lancamentos.set('a', 1);
    passar(1);
    await motor.disparar('TIMER', true);

    expect(await repositorio.listarAnexos()).toEqual([]);
  });

  it.each([
    [400, 'Cada lançamento aceita até 10 fotos.'],
    [413, 'A foto deve ter até 5 MB.'],
  ])('erro %i recusa só a foto, com a mensagem', async (statusCode, mensagem) => {
    await comFoto(lancamento('a'), 'foto-1');
    servidor.falhas.foto = new ApiError(statusCode, mensagem);

    await motor.disparar('LANCAMENTO', true);

    expect((await repositorio.listarAnexos())[0]).toMatchObject({ status: 'RECUSADO', mensagem });
    expect(await statusDe('a')).toBe('ENVIADO');
    expect(rodadas).toEqual([null]);
  });

  it('foto recusada não volta a ser enviada', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    servidor.falhas.foto = new ApiError(413, 'A foto deve ter até 5 MB.');
    await motor.disparar('LANCAMENTO', true);
    servidor.falhas.foto = null;

    passar(60);
    await motor.disparar('TIMER', true);

    expect(servidor.fotos.size).toBe(0);
  });

  it('rede caindo no meio mantém a foto e entra na espera', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    servidor.falhas.foto = SEM_REDE;

    await motor.disparar('LANCAMENTO', true);

    expect((await repositorio.listarAnexos())[0]).toMatchObject({ status: 'PENDENTE' });
    expect(arquivos.size).toBe(1);
    expect(rodadas).toEqual([SEM_REDE]);

    servidor.falhas.foto = null;
    await motor.disparar('CONEXAO_VOLTOU', true);

    expect(servidor.fotos.size).toBe(1);
  });

  it('401 ou erro do servidor não recusa a foto', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    servidor.falhas.foto = new ApiError(500, 'O servidor teve um problema.');

    await motor.disparar('LANCAMENTO', true);

    expect((await repositorio.listarAnexos())[0]?.status).toBe('PENDENTE');
  });

  it('arquivo que sumiu vira foto recusada, sem travar a rodada', async () => {
    await comFoto(lancamento('a'), 'foto-1');
    await comFoto(lancamento('b'), 'foto-2');
    arquivos.delete('file:///anexos/foto-1.jpg');

    await motor.disparar('LANCAMENTO', true);

    const [anexo] = await repositorio.listarAnexos();
    expect(anexo).toMatchObject({
      client_id: 'foto-1',
      status: 'RECUSADO',
      mensagem: 'O arquivo da foto não foi encontrado no aparelho.',
    });
    expect(servidor.fotos.has('foto-2')).toBe(true);
  });
});

describe('bootstrap', () => {
  it('atualiza depois de cada envio', async () => {
    await repositorio.salvarBootstrap(bootstrapCom(13), agora.toISOString());
    await emFila(lancamento('a'));

    await motor.disparar('LANCAMENTO', true);

    expect(servidor.contagem.bootstrap).toBe(1);
  });

  it('sem envio, atualiza a cada 15 min', async () => {
    await repositorio.salvarBootstrap(bootstrapCom(13), agora.toISOString());

    passar(14);
    await motor.disparar('TIMER', true);
    expect(servidor.contagem.bootstrap).toBe(0);

    passar(1);
    await motor.disparar('TIMER', true);
    expect(servidor.contagem.bootstrap).toBe(1);
  });

  it('sem nenhum bootstrap, busca logo', async () => {
    await motor.disparar('ABRIR', true);

    expect(await repositorio.lerBootstrap()).toMatchObject({ iniciado_em: agora.toISOString() });
  });

  it('guarda o horário de antes do pedido', async () => {
    const buscar = servidor.api.buscarBootstrap;
    const inicio = agora.toISOString();
    servidor.api.buscarBootstrap = async () => {
      passar(1);
      return buscar();
    };

    await motor.disparar('ABRIR', true);

    expect((await repositorio.lerBootstrap())?.iniciado_em).toBe(inicio);
  });

  it('o que falhou não substitui o que está guardado', async () => {
    await repositorio.salvarBootstrap(bootstrapCom(13), '2026-11-05T11:00:00.000Z');
    servidor.falhas.bootstrap = new ApiError(502, 'Resposta inesperada.');

    await motor.disparar('TIMER', true);

    expect((await repositorio.lerBootstrap())?.dados).toEqual(bootstrapCom(13));
    expect(rodadas).toHaveLength(1);
  });
});

describe('saldo local durante a sincronização', () => {
  const saldoLocal = async () => {
    const bootstrap = await repositorio.lerBootstrap();
    const inicio = bootstrap?.iniciado_em ?? null;
    const saldos = calcularSaldos(
      bootstrap?.dados.produtos_por_estoque ?? [],
      await repositorio.listarOperacoesEmAberto(inicio),
      inicio,
    );
    return saldoDe(saldos, 1, 10);
  };

  beforeEach(async () => {
    await repositorio.salvarBootstrap(bootstrapCom(13), agora.toISOString());
    passar(1);
    await emFila(lancamento('a'));
  });

  it('conta o lançamento ainda não enviado', async () => {
    expect(await saldoLocal()).toBe(11);
  });

  it('não volta para trás se o bootstrap falhar depois do envio', async () => {
    servidor.falhas.bootstrap = SEM_REDE;

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('a')).toBe('ENVIADO');
    expect(await saldoLocal()).toBe(11);
  });

  it('não conta duas vezes depois do bootstrap novo', async () => {
    servidor.trocarBootstrap(bootstrapCom(11));
    passar(1);

    await motor.disparar('LANCAMENTO', true);

    expect(await saldoLocal()).toBe(11);
  });
});

describe('uma rodada por vez', () => {
  it('dois gatilhos juntos não mandam a mesma operação duas vezes', async () => {
    await emFila(lancamento('a'));
    const enviar = servidor.api.enviarOperacoes;
    let simultaneos = 0;
    let maximo = 0;
    servidor.api.enviarOperacoes = async (dispositivo, operacoes) => {
      simultaneos += 1;
      maximo = Math.max(maximo, simultaneos);
      await new Promise((resolver) => setTimeout(resolver, 5));
      simultaneos -= 1;
      return enviar(dispositivo, operacoes);
    };

    await Promise.all([motor.disparar('TIMER', true), motor.disparar('TIMER', true)]);

    expect(maximo).toBe(1);
    expect(servidor.lotes).toHaveLength(1);
  });

  it('o lançamento feito durante um envio sai logo depois', async () => {
    await emFila(lancamento('a'));
    const enviar = servidor.api.enviarOperacoes;
    servidor.api.enviarOperacoes = async (dispositivo, operacoes) => {
      if (operacoes[0]?.client_id === 'a') {
        await emFila(lancamento('b'));
        void motor.disparar('LANCAMENTO', true);
      }
      return enviar(dispositivo, operacoes);
    };

    await motor.disparar('TIMER', true);

    expect(await statusDe('b')).toBe('ENVIADO');
  });

  it('depois de terminar, aceita outra rodada', async () => {
    await emFila(lancamento('a'));
    await motor.disparar('LANCAMENTO', true);
    await emFila(lancamento('b'));

    await motor.disparar('LANCAMENTO', true);

    expect(await statusDe('b')).toBe('ENVIADO');
  });

  it('nunca lança erro para quem disparou, nem com o banco fora', async () => {
    await emFila(lancamento('a'));
    repositorio.listarOperacoesEmAberto = jest.fn().mockRejectedValue(new Error('Banco fora'));

    await expect(motor.disparar('TIMER', true)).resolves.toBeUndefined();

    expect(rodadas).toHaveLength(1);
  });
});

describe('aceite: 3 lançamentos com uma foto, offline', () => {
  it('tudo chega uma vez só quando a conexão volta', async () => {
    await repositorio.salvarBootstrap(bootstrapCom(13), agora.toISOString());
    await comFoto(lancamento('a'), 'foto-1');
    await emFila(lancamento('b'), lancamento('c'));

    await motor.disparar('LANCAMENTO', false);
    await motor.disparar('TIMER', false);
    expect(servidor.lotes).toEqual([]);

    passar(30);
    await motor.disparar('CONEXAO_VOLTOU', true);
    await motor.disparar('ABRIR', true);
    passar(30);
    await motor.disparar('TIMER', true);

    expect(servidor.lancamentos.size).toBe(3);
    expect(servidor.fotos.size).toBe(1);
    expect(servidor.lotes).toHaveLength(1);
    expect(await repositorio.listarAnexos()).toEqual([]);
    expect(montarPendencias(await operacoes(), [])).toEqual([]);
  });
});
