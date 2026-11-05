import { type ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { cn } from '@/utils/cn';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  contentClassName?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function ScreenContainer({
  children,
  scroll = true,
  contentClassName,
  refreshing,
  onRefresh,
}: Props) {
  const contentClasses = cn('px-4 pb-8 pt-3', contentClassName);

  const body = scroll ? (
    <ScrollView
      contentContainerClassName={contentClasses}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn(contentClasses, 'flex-1')}>{children}</View>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
