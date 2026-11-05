import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { obterRepositorio } from '@/banco';
import { montarPendencias, resumirPendencias } from '@/regras/pendencias';
import { useEnvioStore } from '@/stores/envio-store';

async function lerPendencias() {
  const repositorio = await obterRepositorio();
  const inicio = await repositorio.lerInicioDoBootstrap();
  const [operacoes, anexos] = await Promise.all([
    repositorio.listarOperacoesEmAberto(inicio),
    repositorio.listarAnexos(),
  ]);

  const itens = montarPendencias(operacoes, anexos);
  return { itens, resumo: resumirPendencias(itens), atualizadoEm: inicio };
}

/** Relê o banco a cada rodada de envio e a cada lançamento novo. */
export function usePendencias() {
  const rodada = useEnvioStore((estado) => estado.rodada);

  return useQuery({
    queryKey: ['pendencias', rodada],
    queryFn: lerPendencias,
    placeholderData: keepPreviousData,
  });
}
