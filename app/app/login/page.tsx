'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Usuario o contraseña incorrectos.');
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div id="login-page">
      <div className="login-box">
        <div className="login-logo"><img src="/logo.png" alt="Transporte Meza" /></div>
        <div className="login-title">TRANSPORTE MEZA</div>
        <div className="login-sub">CONTROL DE FLOTA</div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Usuario (email)</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@transportemeza.com" />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
