import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/theme';
import { cn } from '@/utils/cn';

type Props = TextInputProps & {
  label: string;
  error?: string;
  className?: string;
};

export function FormField({ label, error, className, ...rest }: Props) {
  return (
    <View className="mb-4">
      <Text className="font-sans-medium text-sm leading-5 text-ink-secondary mb-2">
        {label}
      </Text>
      <TextInput
        {...rest}
        className={cn(
          'min-h-[56px] rounded-md border border-border bg-surface px-3 py-3 font-sans text-lg text-ink',
          error && 'border-danger',
          className,
        )}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={rest.autoCapitalize ?? 'none'}
      />
      {error ? (
        <Text className="font-sans text-[13px] leading-[18px] text-danger mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
