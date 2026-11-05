import { randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import { obterRepositorio, type Repositorio } from '@/banco';
import type { Gatilho } from '@/regras/agendamento';
import { nomeDoDispositivo } from '@/regras/dispositivo';
import { apagarFoto, fotoExiste } from '@/services/fotos';
import { buscarBootstrap, enviarFoto, enviarOperacoes } from '@/services/tablet-api';
import { useEnvioStore } from '@/stores/envio-store';
import { criarMotor, type Motor } from './motor';

let motor: Motor | null = null;

function montarMotor(repositorio: Repositorio): Motor {
  return criarMotor({
    repositorio,
    api: { enviarOperacoes, enviarFoto, buscarBootstrap },
    arquivos: { existe: fotoExiste, apagar: apagarFoto },
    nomeDoDispositivo: async () =>
      nomeDoDispositivo(Device.modelName, await repositorio.obterIdDoAparelho(randomUUID)),
    agora: () => new Date(),
    aoTerminarRodada: (falha) => {
      useEnvioStore.getState().registrarRodada(falha);
    },
  });
}

export async function dispararEnvio(gatilho: Gatilho): Promise<void> {
  const repositorio = await obterRepositorio();
  motor ??= montarMotor(repositorio);
  await motor.disparar(gatilho, useEnvioStore.getState().conectado);
}
