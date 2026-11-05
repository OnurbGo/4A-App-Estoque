import { avisoDeRepeticao, montarRepeticao, ultimaAplicacao } from '@/regras/repetir-aplicacao';
import type { Produto } from '@/regras/tipos';
import { lancamento, responsavel } from './montagem';

const aplicacao = (seq: number) =>
  lancamento(
    {
      tipo: 'APLICACAO',
      motivo: null,
      motivo_texto: null,
      temperatura_c: 28.5,
      vento_kmh: 7.2,
      itens: [
        { produto_id: 1, quantidade: 40 },
        { produto_id: 2, quantidade: 1.5 },
      ],
    },
    { seq },
  );

const verdict: Produto = { id_almox_produto: 1, nome: 'Verdict Max', unidade: 'L' };
const adjuvante: Produto = { id_almox_produto: 2, nome: 'Adjuvante', unidade: 'kg' };

describe('ultimaAplicacao', () => {
  it('sem aplicação no aparelho, não há o que repetir', () => {
    expect(ultimaAplicacao([lancamento(), responsavel('Ana')])).toBeNull();
  });

  it('pega a mais nova, mesmo fora de ordem e depois de enviada', () => {
    const nova = { ...aplicacao(9), status: 'ENVIADO' as const };

    expect(ultimaAplicacao([aplicacao(3), nova, aplicacao(5), lancamento({}, { seq: 20 })])).toBe(
      nova,
    );
  });
});

describe('montarRepeticao', () => {
  it('preenche produtos e quantidades com os dados atuais do cadastro', () => {
    expect(montarRepeticao(aplicacao(1), [verdict, adjuvante])).toEqual({
      itens: [
        { produto_id: 1, nome: 'Verdict Max', unidade: 'L', quantidade: 40 },
        { produto_id: 2, nome: 'Adjuvante', unidade: 'kg', quantidade: 1.5 },
      ],
      pulados: [],
    });
  });

  it('não repete temperatura nem vento', () => {
    const texto = JSON.stringify(montarRepeticao(aplicacao(1), [verdict, adjuvante]));

    expect(texto).not.toMatch(/temperatura|vento/);
  });

  it('pula o produto desativado e guarda o nome para o aviso', () => {
    const ultima = aplicacao(1);
    ultima.nomes.produtos = { 1: 'Verdict Max', 2: 'Adjuvante' };

    expect(montarRepeticao(ultima, [verdict])).toEqual({
      itens: [{ produto_id: 1, nome: 'Verdict Max', unidade: 'L', quantidade: 40 }],
      pulados: ['Adjuvante'],
    });
  });

  it('não quebra se o nome não foi gravado', () => {
    const ultima = aplicacao(1);
    ultima.nomes.produtos = {};

    expect(montarRepeticao(ultima, []).pulados).toEqual(['Produto 1', 'Produto 2']);
  });
});

describe('avisoDeRepeticao', () => {
  it('sem produto pulado, sem aviso', () => {
    expect(avisoDeRepeticao([])).toBeNull();
  });

  it('avisa no singular e no plural', () => {
    expect(avisoDeRepeticao(['Adjuvante'])).toBe(
      'Adjuvante não está mais no cadastro e ficou de fora.',
    );
    expect(avisoDeRepeticao(['Adjuvante', 'Karate'])).toBe(
      'Adjuvante, Karate não estão mais no cadastro e ficaram de fora.',
    );
  });
});
