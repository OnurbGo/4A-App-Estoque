import { nomeDoDispositivo } from '@/regras/dispositivo';
import { normalizarEndereco, urlDaApi } from '@/regras/endereco';
import { podeAdicionarFoto, redimensionamento } from '@/regras/foto';
import { responsaveisDisponiveis } from '@/regras/responsaveis';
import { lancamento, responsavel } from './montagem';

describe('normalizarEndereco', () => {
  it.each([
    ['192.168.0.10', '192.168.0.10'],
    ['  192.168.0.10  ', '192.168.0.10'],
    ['192.168.0.10:8080', '192.168.0.10:8080'],
    ['http://192.168.0.10', '192.168.0.10'],
    ['http://192.168.0.10/', '192.168.0.10'],
    ['http://192.168.0.10:80/api', '192.168.0.10:80'],
    ['https://Estoque.4a.local/api/', 'https://estoque.4a.local'],
    ['notebook-bruno', 'notebook-bruno'],
  ])('%s vira %s', (texto, endereco) => {
    expect(normalizarEndereco(texto)).toEqual({ ok: true, endereco });
  });

  it.each([
    [''],
    ['   '],
    ['192.168.0'],
    ['192.168.0.256'],
    ['192.168.0.10:0'],
    ['192.168.0.10:70000'],
    ['192.168.0.10/outra'],
    ['ftp://192.168.0.10'],
    ['com espaço'],
    ['-host'],
  ])('recusa "%s"', (texto) => {
    expect(normalizarEndereco(texto).ok).toBe(false);
  });

  it('diz o que digitar quando o endereço é inválido', () => {
    expect(normalizarEndereco('abc def')).toEqual({
      ok: false,
      erro: expect.stringContaining('192.168.0.10'),
    });
  });
});

describe('urlDaApi', () => {
  it('usa http por padrão e o prefixo /api do backend', () => {
    expect(urlDaApi('192.168.0.10')).toBe('http://192.168.0.10/api');
    expect(urlDaApi('192.168.0.10:8080')).toBe('http://192.168.0.10:8080/api');
  });

  it('mantém https quando foi digitado', () => {
    expect(urlDaApi('https://estoque.4a.local')).toBe('https://estoque.4a.local/api');
  });
});

describe('foto', () => {
  it('reduz pelo lado maior até 1600 px', () => {
    expect(redimensionamento(4000, 3000)).toEqual({ width: 1600 });
    expect(redimensionamento(3000, 4000)).toEqual({ height: 1600 });
    expect(redimensionamento(4000, 4000)).toEqual({ width: 1600 });
  });

  it('não aumenta foto pequena', () => {
    expect(redimensionamento(1600, 1200)).toBeNull();
    expect(redimensionamento(800, 600)).toBeNull();
  });

  it('aceita até 10 fotos por lançamento', () => {
    expect(podeAdicionarFoto(9)).toBe(true);
    expect(podeAdicionarFoto(10)).toBe(false);
  });
});

describe('nomeDoDispositivo', () => {
  const id = '6f2b7a1e-1111-4222-8333-444455556666';

  it('junta o modelo e o começo do id', () => {
    expect(nomeDoDispositivo('SM-T220', id)).toBe('SM-T220 6f2b7a');
  });

  it('funciona sem modelo', () => {
    expect(nomeDoDispositivo(null, id)).toBe('Tablet 6f2b7a');
    expect(nomeDoDispositivo('   ', id)).toBe('Tablet 6f2b7a');
  });

  it('cabe no limite de 120 caracteres do servidor', () => {
    expect(nomeDoDispositivo('x'.repeat(300), id)).toHaveLength(120);
  });
});

describe('responsaveisDisponiveis', () => {
  const bootstrap = {
    responsaveis: [
      { id_almox_responsavel: 1, nome: 'Carlos' },
      { id_almox_responsavel: 2, nome: 'Ana' },
    ],
  };

  it('traz os do bootstrap em ordem alfabética, por id', () => {
    expect(responsaveisDisponiveis(bootstrap, [], null)).toEqual([
      { chave: 'id:2', nome: 'Ana', responsavel_id: 2 },
      { chave: 'id:1', nome: 'Carlos', responsavel_id: 1 },
    ]);
  });

  it('inclui o cadastrado no aparelho, por client_id', () => {
    const novo = responsavel('Bia');

    expect(responsaveisDisponiveis(bootstrap, [novo], null)[1]).toEqual({
      chave: `local:${novo.client_id}`,
      nome: 'Bia',
      responsavel_client_id: novo.client_id,
    });
  });

  it('ignora lançamentos e cadastros recusados', () => {
    const recusado = responsavel('Bia', { status: 'RECUSADO' });

    expect(responsaveisDisponiveis(bootstrap, [recusado, lancamento()], null)).toHaveLength(2);
  });

  it('não duplica depois que o bootstrap traz o cadastro', () => {
    const enviado = responsavel('Ana', {
      status: 'ENVIADO',
      id_servidor: 2,
      enviado_em: '2026-11-05T12:20:00.000Z',
    });

    expect(responsaveisDisponiveis(bootstrap, [enviado], '2026-11-05T12:00:00.000Z')).toHaveLength(
      2,
    );
  });

  it('continua disponível enquanto o bootstrap não alcança o envio', () => {
    const enviado = responsavel('Bia', {
      status: 'ENVIADO',
      id_servidor: 3,
      enviado_em: '2026-11-05T12:20:00.000Z',
    });

    expect(responsaveisDisponiveis(bootstrap, [enviado], '2026-11-05T12:00:00.000Z')).toHaveLength(
      3,
    );
  });

  it('some se o bootstrap já é mais novo e não traz o cadastro', () => {
    const enviado = responsavel('Bia', {
      status: 'ENVIADO',
      id_servidor: 3,
      enviado_em: '2026-11-05T11:00:00.000Z',
    });

    expect(responsaveisDisponiveis(bootstrap, [enviado], '2026-11-05T12:00:00.000Z')).toHaveLength(
      2,
    );
  });
});
