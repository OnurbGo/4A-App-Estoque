export type EnderecoNormalizado = { ok: true; endereco: string } | { ok: false; erro: string };

const INVALIDO: EnderecoNormalizado = {
  ok: false,
  erro: 'Confira o endereço. Exemplo: 192.168.0.10 ou 192.168.0.10:8080',
};

const FORMATO = /^(?:(https?):\/\/)?([^/:\s]+)(?::(\d+))?(?:\/api)?\/?$/i;
const NOME_DE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const SO_NUMEROS_E_PONTOS = /^[\d.]+$/;
const PORTA_MAXIMA = 65535;

function ipv4Valido(host: string): boolean {
  const partes = host.split('.');
  return partes.length === 4 && partes.every((parte) => /^\d+$/.test(parte) && Number(parte) <= 255);
}

function hostValido(host: string): boolean {
  if (SO_NUMEROS_E_PONTOS.test(host)) return ipv4Valido(host);
  return NOME_DE_HOST.test(host);
}

/** Aceita "192.168.0.10", "192.168.0.10:8080" e o que vier colado com http:// ou /api. */
export function normalizarEndereco(texto: string): EnderecoNormalizado {
  const [, esquema, hostDigitado, porta] = FORMATO.exec(texto.trim()) ?? [];
  if (!hostDigitado) return INVALIDO;

  const host = hostDigitado.toLowerCase();
  if (!hostValido(host)) return INVALIDO;
  if (porta !== undefined && (Number(porta) < 1 || Number(porta) > PORTA_MAXIMA)) return INVALIDO;

  const hostComPorta = porta === undefined ? host : `${host}:${Number(porta)}`;
  return {
    ok: true,
    endereco: esquema?.toLowerCase() === 'https' ? `https://${hostComPorta}` : hostComPorta,
  };
}

export function urlDaApi(endereco: string): string {
  return endereco.startsWith('https://') ? `${endereco}/api` : `http://${endereco}/api`;
}
