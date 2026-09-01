'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate, fmtMoney } from '@/lib/utils';
import { DocBadge } from '@/components/ui';
import { DRIVER_DOC_FIELDS, Driver, DriverDoc, Fuel, Trip, Vehicle } from '@/lib/types';

export default function InicioPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverDocs, setDriverDocs] = useState<DriverDoc[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const [v, d, dd, t, f] = await Promise.all([
        supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
        supabase.from('drivers').select('*').order('created_at', { ascending: false }),
        supabase.from('driver_docs').select('*'),
        supabase.from('trips').select('*').order('fecha', { ascending: false }),
        supabase.from('fuel').select('*'),
      ]);
      setVehicles(v.data || []); setDrivers(d.data || []); setDriverDocs(dd.data || []);
      setTrips(t.data || []); setFuel(f.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando datos...</div>;

  const findDriver = (id: string) => drivers.find(d => d.id === id);
  const findVehicle = (id: string | null) => vehicles.find(v => v.id === id);

  const alerts: { driver: Driver; label: string; dateStr: string | null }[] = [];
  drivers.forEach(d => {
    DRIVER_DOC_FIELDS.forEach(([key, label]) => {
      const doc = driverDocs.find(x => x.driver_id === d.id && x.key === key);
      const dateStr = doc?.vencimiento || null;
      if (!dateStr) return;
      const days = Math.round((new Date(dateStr + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
      if (days <= 30) alerts.push({ driver: d, label, dateStr });
    });
  });

  const thisMonth = new Date().toISOString().slice(0, 7);
  const fuelThisMonth = fuel.filter(f => f.fecha?.slice(0, 7) === thisMonth);
  const gastoMes = fuelThisMonth.reduce((s, f) => s + (Number(f.total) || 0), 0);
  const tripsThisMonth = trips.filter(t => t.fecha?.slice(0, 7) === thisMonth);
  const recentTrips = trips.slice(0, 5);

  return (
    <>
      <div id="topbar"><div><h1>Inicio</h1><div className="sub">Resumen general de la flota</div></div></div>
      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <div className="card stat-card"><div className="stat-label">Vehículos en flota</div><div className="stat-value">{vehicles.length}</div></div>
        <div className="card stat-card"><div className="stat-label">Choferes</div><div className="stat-value">{drivers.length}</div></div>
        <div className="card stat-card"><div className="stat-label">Viajes este mes</div><div className="stat-value">{tripsThisMonth.length}</div></div>
        <div className="card stat-card"><div className="stat-label">Gasto combustible este mes</div><div className="stat-value">{fmtMoney(gastoMes)}</div></div>
      </div>
      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12, fontSize: 18 }}>Documentación por vencer</h3>
          {alerts.length === 0
            ? <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>No hay documentación de choferes vencida ni próxima a vencer.</p>
            : alerts.slice(0, 8).map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div><div style={{ fontWeight: 600 }}>{a.driver.nombre}</div><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{a.label}</div></div>
                <DocBadge dateStr={a.dateStr} />
              </div>
            ))}
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12, fontSize: 18 }}>Últimos viajes</h3>
          {recentTrips.length === 0
            ? <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>Todavía no cargaste viajes.</p>
            : recentTrips.map(t => {
              const v = findVehicle(t.vehicle_id);
              return (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{t.origen || '—'} → {t.destino || '—'}</span>
                    <span style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>{fmtDate(t.fecha)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{v ? v.patente : 'Vehículo no asignado'}</div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
