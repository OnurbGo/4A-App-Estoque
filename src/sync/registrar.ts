import { randomUUID } from 'expo-crypto';
import { obterRepositorio, type FotoNova } from '@/banco';
import type { DadosLancamento, NomesLancamento } from '@/regras/tipos';
import { apagarFoto, guardarFoto, type FotoTirada } from '@/services/fotos';
import { useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from './index';

export type NovoLancamento = {
  dados: Omit<DadosLancamento, 'ocorrido_em'>;
  nomes: NomesLancamento;
  fotos: readonly FotoTirada[];
};

async function guardarFotos(fotos: readonly FotoTirada[]): Promise<FotoNova[]> {
  const guardadas: FotoNova[] = [];
  try {
    for (const foto of fotos) {
      const client_id = randomUUID();
      guardadas.push({ client_id, caminho: await guardarFoto(foto, client_id) });
    }
    return guardadas;
  } catch (erro) {
    guardadas.forEach(({ caminho }) => apagarFoto(caminho));
    throw erro;
  }
}

/** Grava na fila e só depois tenta enviar: o lançamento nunca depende da rede. */
export async function registrarLancamento({ dados, nomes, fotos }: NovoLancamento) {
  const repositorio = await obterRepositorio();
  const client_id = randomUUID();
  const agora = new Date().toISOString();
  const guardadas = await guardarFotos(fotos);

  try {
    await repositorio.enfileirar(
      { tipo: 'LANCAMENTO_CRIAR', client_id, dados: { ...dados, ocorrido_em: agora }, nomes },
      agora,
      guardadas,
    );
  } catch (erro) {
    guardadas.forEach(({ caminho }) => apagarFoto(caminho));
    throw erro;
  }

  useEnvioStore.getState().avisarMudanca();
  void dispararEnvio('LANCAMENTO');
  return client_id;
}

export async function registrarResponsavel(nome: string): Promise<string> {
  const repositorio = await obterRepositorio();
  const client_id = randomUUID();

  await repositorio.enfileirar(
    { tipo: 'RESPONSAVEL_CRIAR', client_id, nome: nome.trim() },
    new Date().toISOString(),
  );

  useEnvioStore.getState().avisarMudanca();
  void dispararEnvio('LANCAMENTO');
  return client_id;
}
