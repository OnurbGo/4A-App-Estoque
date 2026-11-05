import type {
  ControleOperacao,
  DadosLancamento,
  OperacaoLancamento,
  OperacaoResponsavel,
} from '@/regras/tipos';

let proximoSeq = 1;

function controle(parcial: Partial<ControleOperacao>): ControleOperacao {
  const seq = parcial.seq ?? proximoSeq++;
  return {
    seq,
    client_id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    status: 'PENDENTE',
    tentativas: 0,
    mensagem: null,
    id_servidor: null,
    criado_em: '2026-11-05T12:00:00.000Z',
    enviado_em: null,
    proxima_tentativa_em: null,
    ...parcial,
  };
}

export function lancamento(
  dados: Partial<DadosLancamento> = {},
  parcial: Partial<ControleOperacao> = {},
): OperacaoLancamento {
  return {
    ...controle(parcial),
    tipo: 'LANCAMENTO_CRIAR',
    dados: {
      tipo: 'SAIDA',
      motivo: 'OUTROS',
      motivo_texto: 'Uso interno',
      estoque_id: 1,
      responsavel_id: 7,
      ocorrido_em: '2026-11-05T12:00:00.000Z',
      itens: [{ produto_id: 10, quantidade: 1 }],
      ...dados,
    },
    nomes: { responsavel: 'Carlos', estoque: 'Casinha de defensivos', produtos: { 10: 'Verdict' } },
  };
}

export function responsavel(
  nome: string,
  parcial: Partial<ControleOperacao> = {},
): OperacaoResponsavel {
  return { ...controle(parcial), tipo: 'RESPONSAVEL_CRIAR', nome };
}
