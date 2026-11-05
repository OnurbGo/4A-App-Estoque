import { fireEvent, render, screen } from '@testing-library/react-native';
import { EmptyState, ErrorState, OfflineStatusBanner, PrimaryButton } from '@/components';

describe('PrimaryButton', () => {
  it('chama a ação ao tocar', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Entrar" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não responde enquanto carrega', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Entrar" loading onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('estados da tela', () => {
  it('estado vazio diz o que fazer', async () => {
    await render(<EmptyState title="Nada aguardando envio" description="Tudo foi enviado." />);

    expect(screen.getByText('Nada aguardando envio')).toBeTruthy();
    expect(screen.getByText('Tudo foi enviado.')).toBeTruthy();
  });

  it('erro oferece tentar de novo', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState onRetry={onRetry} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('aviso de conexão só aparece sem conexão', async () => {
    const { rerender } = await render(<OfflineStatusBanner semConexao={false} />);
    expect(screen.queryByTestId('offline-status-banner')).toBeNull();

    await rerender(<OfflineStatusBanner semConexao />);
    expect(screen.getByTestId('offline-status-banner')).toBeTruthy();
  });
});
