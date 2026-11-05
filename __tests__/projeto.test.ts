import app from '../app.json';

describe('configuração do app', () => {
  const { expo } = app;

  it('gira com o aparelho (regra 28)', () => {
    expect(expo.orientation).toBe('default');
  });

  it('usa nome, scheme e pacote próprios, sem nada do Portal', () => {
    expect(expo.name).toBe('Estoque 4A');
    expect(expo.scheme).toBe('estoque4a');
    expect(expo.android.package).toBe('br.com.estoque4a.app');
    expect(JSON.stringify(expo)).not.toMatch(/portal/i);
  });

  it('não pede notificações', () => {
    expect(JSON.stringify(expo)).not.toMatch(/notification|RECEIVE_BOOT_COMPLETED|VIBRATE/i);
  });

  it('libera HTTP sem TLS para o IP do servidor', () => {
    const plugin = expo.plugins.find(
      (item) => Array.isArray(item) && item[0] === 'expo-build-properties',
    );
    expect(JSON.stringify(plugin)).toContain('"usesCleartextTraffic":true');
  });
});
