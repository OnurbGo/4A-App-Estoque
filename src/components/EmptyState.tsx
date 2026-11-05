import { Text, View } from 'react-native';

type Props = {
  title?: string;
  description?: string;
};

export function EmptyState({
  title = 'Nada por aqui',
  description = 'Não há itens para exibir no momento.',
}: Props) {
  return (
    <View className="py-8 items-center" testID="empty-state">
      <Text className="font-sans-medium text-lg leading-[26px] text-ink text-center">
        {title}
      </Text>
      <Text className="font-sans text-base leading-6 text-ink-secondary text-center mt-2">
        {description}
      </Text>
    </View>
  );
}
