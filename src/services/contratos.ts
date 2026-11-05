import { z } from 'zod';
import type { ResultadoAnexo, ResultadoOperacao } from '@/regras/fila';
import type { Bootstrap, Estoque } from '@/regras/tipos';

/** Ids aceitam texto: nem toda rota do backend converte BIGINT antes de responder. */
const id = z.coerce.number().int().positive();

const estoque = z.object({
  id_almox_estoque: id,
  nome: z.string(),
  grupo: z.enum(['INSUMOS', 'COMBUSTIVEL']),
});

export const esquemaEstoques: z.ZodType<Estoque[], unknown> = z.array(estoque);

/**
 * Só o que muda o app precisa bater: campo novo do servidor é ignorado, e um bootstrap que não
 * passa aqui nunca substitui o que está guardado no aparelho.
 */
export const esquemaBootstrap: z.ZodType<Bootstrap, unknown> = z.object({
  estoques: z.array(estoque),
  produtos: z.array(
    z.object({ id_almox_produto: id, nome: z.string(), unidade: z.enum(['L', 'kg']) }),
  ),
  produtos_por_estoque: z.array(
    z.object({
      estoque_id: id,
      produtos: z.array(z.object({ produto_id: id, saldo: z.number() })),
      recentes: z.array(id),
    }),
  ),
  responsaveis: z.array(z.object({ id_almox_responsavel: id, nome: z.string() })),
  terceiros: z.array(z.object({ id_entidade: id, nome: z.string() })),
  maquinas: z.array(
    z.object({
      id_patrimonio: id,
      nome: z.string(),
      tipo_medidor: z.enum(['HORAS', 'QUILOMETROS']),
      medidor_atual: z.number().nullable(),
    }),
  ),
  motivos: z.record(z.string(), z.array(z.string())).transform((motivos) => motivos as Bootstrap['motivos']),
});

export const esquemaSync: z.ZodType<{ resultados: ResultadoOperacao[] }, unknown> = z.object({
  resultados: z.array(
    z.object({
      client_id: z.string().nullable(),
      tipo: z.string().nullable().optional(),
      status: z.string(),
      mensagem: z.string().optional(),
      responsavel_id: z.number().optional(),
      lancamento_id: z.number().optional(),
    }),
  ),
});

export const esquemaAnexo: z.ZodType<{ status: ResultadoAnexo }, unknown> = z.object({
  status: z.enum(['SINCRONIZADO', 'JA_SINCRONIZADO', 'AGUARDANDO_LANCAMENTO']),
});
