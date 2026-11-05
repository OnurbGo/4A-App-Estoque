import { Pressable, Text, View } from 'react-native';

type Props = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
};

export function ErrorState({
  title = 'Não foi possível carregar',
  description = 'Confira a conexão e tente de novo.',
  onRetry,
  retryLabel = 'Tentar novamente',
  testID = 'error-state',
}: Props) {
  return (
    <View className="py-8 items-center" testID={testID} accessibilityRole="alert">
      <Text className="font-sans-medium text-lg leading-[26px] text-ink text-center">
        {title}
      </Text>
      <Text className="font-sans text-base leading-6 text-ink-secondary text-center mt-2">
        {description}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-4 min-h-[56px] items-center justify-center rounded-md bg-primary px-6 py-3"
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text className="font-sans-bold text-base leading-[22px] text-white">
            {retryLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
