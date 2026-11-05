import * as SecureStore from 'expo-secure-store';

const CHAVE_EMAIL = 'estoque4a.email';
const CHAVE_SENHA = 'estoque4a.senha';
const CHAVE_TOKEN = 'estoque4a.token';

export type Credenciais = { email: string; senha: string };

export function lerToken(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE_TOKEN);
}

export function lerEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE_EMAIL);
}

export async function lerCredenciais(): Promise<Credenciais | null> {
  const [email, senha] = await Promise.all([lerEmail(), SecureStore.getItemAsync(CHAVE_SENHA)]);
  return email && senha ? { email, senha } : null;
}

export async function salvarCredenciais(credenciais: Credenciais & { token: string }) {
  await SecureStore.setItemAsync(CHAVE_EMAIL, credenciais.email);
  await SecureStore.setItemAsync(CHAVE_SENHA, credenciais.senha);
  await SecureStore.setItemAsync(CHAVE_TOKEN, credenciais.token);
}

export function salvarToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(CHAVE_TOKEN, token);
}

/** O e-mail fica, para já vir preenchido no próximo login. */
export async function limparCredenciais(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE_SENHA);
  await SecureStore.deleteItemAsync(CHAVE_TOKEN);
}

/** Compara com a senha salva: as Configurações precisam abrir mesmo sem conexão. */
export async function senhaConfere(senha: string): Promise<boolean> {
  const credenciais = await lerCredenciais();
  return credenciais !== null && credenciais.senha === senha;
}
