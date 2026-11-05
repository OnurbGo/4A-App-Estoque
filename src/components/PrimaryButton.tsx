import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { colors } from '@/theme';
import { cn } from '@/utils/cn';

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
};

/** Pelo menos 56 dp em qualquer tamanho de tela ("Facilidade de uso"). */
export function PrimaryButton({
  label,
  loading,
  variant = 'primary',
  disabled,
  className,
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      className={cn(
        'min-h-[56px] items-center justify-center rounded-md px-6 py-3',
        variant === 'primary' && 'bg-primary',
        variant === 'secondary' && 'border border-border bg-primary-soft',
        variant === 'ghost' && 'bg-transparent',
        isDisabled && 'opacity-[0.55]',
        className,
      )}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.primary} />
      ) : (
        <Text
          className={cn(
            'font-sans-bold text-lg leading-6',
            variant === 'primary' ? 'text-white' : 'text-primary-dark',
          )}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
