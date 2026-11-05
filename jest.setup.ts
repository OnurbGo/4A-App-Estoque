jest.mock('expo-secure-store', () => {
  const guardado = new Map<string, string>();
  return {
    __guardado: guardado,
    getItemAsync: jest.fn(async (chave: string) => guardado.get(chave) ?? null),
    setItemAsync: jest.fn(async (chave: string, valor: string) => {
      guardado.set(chave, valor);
    }),
    deleteItemAsync: jest.fn(async (chave: string) => {
      guardado.delete(chave);
    }),
  };
});
