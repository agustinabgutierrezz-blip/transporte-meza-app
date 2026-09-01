'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseClient';

const NAV = [
  { href: '/dashboard', label: 'Inicio', match: (p: string) => p === '/dashboard' },
  { href: '/dashboard/flota', label: 'Flota', match: (p: string) => p.startsWith('/dashboard/flota') },
  { href: '/dashboard/choferes', label: 'Choferes', match: (p: string) => p.startsWith('/dashboard/choferes') },
  { href: '/dashboard/viajes', label: 'Viajes', match: (p: string) => p.startsWith('/dashboard/viajes') },
  { href: '/dashboard/combustible', label: 'Combustible', match: (p: string) => p.startsWith('/dashboard/combustible') },
  { href: '/dashboard/facturacion', label: 'Facturación', match: (p: string) => p.startsWith('/dashboard/facturacion') },
  { href: '/dashboard/clientes', label: 'Clientes', match: (p: string) => p.startsWith('/dashboard/clientes') },
  { href: '/dashboard/tarifas', label: 'Tarifas', match: (p: string) => p.startsWith('/dashboard/tarifas') },
  { href: '/dashboard/reportes', label: 'Reportes', match: (p: string) => p.startsWith('/dashboard/reportes') },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div id="sidebar">
        <div className="brand">
          <div className="brand-mark"><img src="/logo.png" alt="Transporte Meza" /></div>
          <div>
            <div className="brand-title">MEZA</div>
            <div className="brand-sub">SERVICIOS LOGÍSTICOS</div>
          </div>
        </div>
        <nav>
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className={`nav-item ${item.match(pathname) ? 'active' : ''}`}>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button className="nav-item" style={{ margin: '0 10px 14px' }} onClick={logout}>
          <span>Cerrar sesión</span>
        </button>
        <div className="sidebar-foot">Los datos se guardan en tu base de datos propia.</div>
      </div>
      <div id="app">
        <div id="content" style={{ paddingTop: 28 }}>{children}</div>
      </div>
    </div>
  );
}
