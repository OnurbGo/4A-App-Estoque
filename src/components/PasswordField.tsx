import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors } from '@/theme';
import { cn } from '@/utils/cn';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string;
  error?: string;
  className?: string;
};

export function PasswordField({ label, error, className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="mb-4">
      <Text className="font-sans-medium text-sm leading-5 text-ink-secondary mb-2">
        {label}
      </Text>
      <View
        className={cn(
          'flex-row items-center border border-border bg-surface rounded-md',
          error && 'border-danger',
        )}
      >
        <TextInput
          {...rest}
          secureTextEntry={!visible}
          className={cn(
            'min-h-[56px] flex-1 px-3 py-3 font-sans text-lg text-ink',
            className,
          )}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          className="min-h-[56px] justify-center px-3 py-2"
        >
          <Text className="font-sans-medium text-sm leading-5 text-primary">
            {visible ? 'Ocultar' : 'Mostrar'}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <Text className="font-sans text-[13px] leading-[18px] text-danger mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
