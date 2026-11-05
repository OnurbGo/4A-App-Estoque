import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';
import { FormField, PasswordField, PrimaryButton, ScreenContainer } from '@/components';
import { toFriendlyError } from '@/services/errors';
import { useSessionStore } from '@/stores/session-store';

const esquemaLogin = z.object({
  email: z.string().trim().email('Informe o e-mail da conta dos tablets.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

type DadosLogin = z.infer<typeof esquemaLogin>;

export default function Login() {
  const router = useRouter();
  const entrar = useSessionStore((estado) => estado.entrar);
  const aviso = useSessionStore((estado) => estado.aviso);
  const emailSalvo = useSessionStore((estado) => estado.email);
  const [erro, setErro] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DadosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: emailSalvo ?? '', senha: '' },
  });

  const aoEntrar = handleSubmit(async ({ email, senha }) => {
    setErro(null);
    try {
      await entrar(email, senha);
    } catch (falha) {
      setErro(toFriendlyError(falha).message);
    }
  });

  return (
    <ScreenContainer contentClassName="flex-grow justify-center">
      <View className="mb-8">
        <Text className="font-sans-bold text-3xl leading-10 text-primary-dark">Estoque 4A</Text>
        <Text className="mt-1 font-sans text-base leading-6 text-ink-secondary">
          Entre com a conta dos tablets
        </Text>
      </View>

      {aviso ? (
        <View
          className="mb-4 rounded-md border border-warning bg-warning-soft p-3"
          accessibilityRole="alert"
        >
          <Text className="font-sans-medium text-base leading-6 text-warning">{aviso}</Text>
        </View>
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormField
            label="E-mail"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email?.message}
            testID="login-email"
          />
        )}
      />

      <Controller
        control={control}
        name="senha"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordField
            label="Senha"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.senha?.message}
            testID="login-senha"
          />
        )}
      />

      {erro ? (
        <Text
          className="mb-4 font-sans text-base leading-6 text-danger"
          accessibilityRole="alert"
          testID="login-erro"
        >
          {erro}
        </Text>
      ) : null}

      <PrimaryButton
        label="Entrar"
        onPress={() => void aoEntrar()}
        loading={isSubmitting}
        testID="login-entrar"
      />

      <PrimaryButton
        label="Opções avançadas"
        variant="ghost"
        className="mt-2"
        onPress={() => router.push('/opcoes-avancadas')}
        testID="login-opcoes"
      />
    </ScreenContainer>
  );
}
