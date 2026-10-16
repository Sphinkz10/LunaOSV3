import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithPassword, useAuthStore } from '@luna/core';
import { Button, Card, Input } from '@luna/ui';
import { getSupabaseClient } from '../lib/supabase';

export function Login() {
  const status = useAuthStore((s) => s.status);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A porta da Gestão decide o resto (sem papel, erro…)
  if (status === 'signedIn' || status === 'noRole' || status === 'error') return <Navigate to="/today" replace />;

  const client = getSupabaseClient();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(client, email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(/confirm/i.test(msg)
        ? 'Confirma primeiro o teu email: abre a ligação que te enviámos.'
        : /invalid/i.test(msg) ? 'Email ou palavra-passe errados.' : msg || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'var(--sp-6)' }}>
      <Card elevated style={{ width: 'min(100%, 24rem)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', marginTop: 0 }}>LUNA.OS</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Entrar na Gestão</p>
        {!client ? (
          <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>
            Falta a ligação ao servidor: copia .env.example para .env na raiz do projeto, preenche
            VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicia a app.
          </p>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} required />
            <Input label="Palavra-passe" type="password" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} required />
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>{error}</p>}
            <Button type="submit" disabled={loading}>{loading ? 'A entrar…' : 'Entrar'}</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
