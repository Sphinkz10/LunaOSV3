import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithPassword, useAuthStore } from '@luna/core';
import { Button, Card, Input } from '@luna/ui';
import { getSupabaseClient } from '../lib/supabase';

export function Login() {
  const status = useAuthStore((s) => s.status);
  const [email, setEmail] = useState('coach@luna.os');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === 'signedIn') return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
      setError('Supabase não configurado — preenche .env e reinicia o dev server.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(client, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'var(--sp-6)' }}>
      <Card elevated style={{ width: 'min(100%, 24rem)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', marginTop: 0 }}>🌑 LUNA.OS</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Entrar como treinador</p>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} required />
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} required />
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'A entrar…' : 'Entrar'}</Button>
        </form>
      </Card>
    </main>
  );
}
