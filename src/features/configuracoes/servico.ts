import type { Repositorio } from '@/banco';
import { montarPendencias, resumirPendencias } from '@/regras/pendencias';
import type { Estoque } from '@/regras/tipos';
import { definirEndereco } from '@/services/api-client';

export type DadosConfiguracoes = {
  endereco: string;
  estoque_padrao_id: number | null;
  /** Do último bootstrap: dá para trocar o estoque padrão mesmo sem conexão. */
  estoques: Estoque[];
};

export async function carregarConfiguracoes(
  repositorio: Repositorio,
): Promise<DadosConfiguracoes> {
  const [config, bootstrap] = await Promise.all([
    repositorio.lerConfig(),
    repositorio.lerBootstrap(),
  ]);

  return {
    endereco: config.endereco ?? '',
    estoque_padrao_id: config.estoque_padrao_id,
    estoques: bootstrap?.dados.estoques ?? [],
  };
}

export async function quantosAguardamEnvio(repositorio: Repositorio): Promise<number> {
  const bootstrap = await repositorio.lerBootstrap();
  const [operacoes, anexos] = await Promise.all([
    repositorio.listarOperacoesEmAberto(bootstrap?.iniciado_em ?? null),
    repositorio.listarAnexos(),
  ]);
  return resumirPendencias(montarPendencias(operacoes, anexos)).aguardando;
}

/**
 * Trocar o estoque padrão não mexe em nada que já foi lançado: cada lançamento guarda os estoques
 * dele. Trocar o servidor invalida o bootstrap, que tem os ids do servidor anterior.
 */
export async function salvarConfiguracoes(
  repositorio: Repositorio,
  { endereco, estoque_padrao_id }: Pick<DadosConfiguracoes, 'endereco' | 'estoque_padrao_id'>,
): Promise<void> {
  const atual = await repositorio.lerConfig();

  await repositorio.salvarConfig({ endereco, estoque_padrao_id });
  if (atual.endereco !== endereco) await repositorio.limparBootstrap();
  definirEndereco(endereco);
}

export async function enderecoVaiMudar(
  repositorio: Repositorio,
  endereco: string,
): Promise<boolean> {
  const atual = await repositorio.lerConfig();
  return atual.endereco !== null && atual.endereco !== endereco;
}
