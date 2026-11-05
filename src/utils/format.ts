const QUANTIDADE = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Quantidade na unidade do cadastro (L ou kg), sem valor monetário. */
export function formatQuantidade(valor: number, unidade: string): string {
  return `${QUANTIDADE.format(valor)} ${unidade}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return DATA_HORA.format(data);
}
