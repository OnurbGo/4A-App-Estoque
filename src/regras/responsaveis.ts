import { refletidaNoBootstrap } from './saldo-local';
import type { Bootstrap, OperacaoLocal, OperacaoResponsavel } from './tipos';

export type OpcaoResponsavel =
  | { chave: string; nome: string; responsavel_id: number }
  | { chave: string; nome: string; responsavel_client_id: string };

/**
 * Os do bootstrap mais os cadastrados neste aparelho que ele ainda não traz. O criado aqui segue
 * por `client_id` mesmo depois de enviado: o servidor sempre consegue resolvê-lo.
 */
export function responsaveisDisponiveis(
  bootstrap: Pick<Bootstrap, 'responsaveis'>,
  operacoes: readonly OperacaoLocal[],
  bootstrapIniciadoEm: string | null,
): OpcaoResponsavel[] {
  const noBootstrap = new Set(
    bootstrap.responsaveis.map(({ id_almox_responsavel }) => id_almox_responsavel),
  );

  const locais = operacoes.filter(
    (operacao): operacao is OperacaoResponsavel =>
      operacao.tipo === 'RESPONSAVEL_CRIAR' &&
      operacao.status !== 'RECUSADO' &&
      !refletidaNoBootstrap(operacao, bootstrapIniciadoEm) &&
      !(operacao.id_servidor !== null && noBootstrap.has(operacao.id_servidor)),
  );

  const opcoes: OpcaoResponsavel[] = [
    ...bootstrap.responsaveis.map(({ id_almox_responsavel, nome }) => ({
      chave: `id:${id_almox_responsavel}`,
      nome,
      responsavel_id: id_almox_responsavel,
    })),
    ...locais.map(({ client_id, nome }) => ({
      chave: `local:${client_id}`,
      nome,
      responsavel_client_id: client_id,
    })),
  ];

  return opcoes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
