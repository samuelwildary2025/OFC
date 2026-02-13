'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { MessageSquare, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        toast.success('Login realizado com sucesso!');
      } else {
        await register(email, password, name);
        toast.success('Conta criada com sucesso!');
      }
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao processar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f1f17] via-transparent to-[#0a2a1b]" />
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-[#22c55e]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#16a34a]/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)]/15 mb-4">
            <MessageSquare className="w-7 h-7 text-[var(--primary)]" />
          </div>
          <h1 className="text-2xl font-semibold">WhatsApp API</h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            {isLogin ? 'Faça seu login' : 'Crie sua conta grátis'}
          </p>
        </div>

        <div className="card p-8 animate-fade-in">
          <div className="mb-6">
            <p className="text-sm text-[var(--muted-foreground)]">
              {isLogin
                ? 'Para continuar, informe seu e-mail e senha'
                : 'Preencha seus dados para começar'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Nome</label>
                <input
                  type="text"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium">E-mail</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>

            {isLogin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processando...
                </>
              ) : isLogin ? (
                'Entrar'
              ) : (
                'Criar Conta'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-[var(--primary)] hover:underline text-sm"
            >
              {isLogin ? 'Crie uma conta grátis' : 'Já tenho conta'}
            </button>
          </div>
        </div>

        <p className="text-center text-[var(--muted-foreground)] text-sm mt-8">
          Gerencie seus números e campanhas com segurança
        </p>
      </div>
    </div>
  );
}
