'use client';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtMoney } from '@/lib/utils';
import { useToast } from '@/components/ui';
import { Fuel, Invoice, Mantenimiento, Trip, Vehicle, VehiclePayment } from '@/lib/types';

export default function ReportesPage() {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [pagos, setPagos] = useState<VehiclePayment[]>([]);
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const [v, inv, f, t, m, p] = await Promise.all([
      supabase.from('vehicles').select('*'),
      supabase.from('invoices').select('*'),
      supabase.from('fuel').select('*'),
      supabase.from('trips').select('*'),
      supabase.from('vehicle_mantenimientos').select('*'),
      supabase.from('vehicle_payments').select('*'),
    ]);
    setVehicles(v.data || []); setInvoices(inv.data || []); setFuel(f.data || []);
    setTrips(t.data || []); setMantenimientos(m.data || []); setPagos(p.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const rentabilidad = useMemo(() => {
    const byMonth: Record<string, { facturado: number; combustible: number; mantenimiento: number; pagos: number }> = {};
    function bucket(mk: string) {
      if (!byMonth[mk]) byMonth[mk] = { facturado: 0, combustible: 0, mantenimiento: 0, pagos: 0 };
      return byMonth[mk];
    }
    invoices.forEach(i => { const mk = i.fecha?.slice(0, 7); if (mk) bucket(mk).facturado += Number(i.monto) || 0; });
    fuel.forEach(f => { const mk = f.fecha?.slice(0, 7); if (mk) bucket(mk).combustible += Number(f.total) || 0; });
    mantenimientos.forEach(m => { const mk = m.fecha?.slice(0, 7); if (mk) bucket(mk).mantenimiento += Number(m.costo) || 0; });
    pagos.forEach(p => { const mk = p.fecha?.slice(0, 7); if (mk) bucket(mk).pagos += Number(p.monto) || 0; });
    const months = Object.keys(byMonth).sort();
    const rows = months.map(m => {
      const b = byMonth[m];
      const gastos = b.combustible + b.mantenimiento + b.pagos;
      return { mes: m, facturado: b.facturado, gastos, neto: b.facturado - gastos };
    });
    const totales = rows.reduce((acc, r) => ({
      facturado: acc.facturado + r.facturado, gastos: acc.gastos + r.gastos, neto: acc.neto + r.neto,
    }), { facturado: 0, gastos: 0, neto: 0 });
    return { rows, totales };
  }, [invoices, fuel, mantenimientos, pagos]);

  const consumo = useMemo(() => {
    return vehicles.map(v => {
      const litros = fuel.filter(f => f.vehicle_id === v.id).reduce((s, f) => s + (Number(f.litros) || 0), 0);
      const gastoCombustible = fuel.filter(f => f.vehicle_id === v.id).reduce((s, f) => s + (Number(f.total) || 0), 0);
      const km = trips.filter(t => t.vehicle_id === v.id).reduce((s, t) => s + (Number(t.km) || 0), 0);
      const l100km = km > 0 ? (litros / km) * 100 : null;
      return { vehicle: v, litros, km, l100km, gastoCombustible };
    }).filter(r => r.litros > 0 || r.km > 0);
  }, [vehicles, fuel, trips]);

  function exportReporte() {
    if (rentabilidad.rows.length === 0 && consumo.length === 0) { showToast('Todavía no hay datos suficientes para el reporte', 'error'); return; }
    const wb = XLSX.utils.book_new();

    const rentRows = rentabilidad.rows.map(r => ({ Mes: r.mes, Facturado: r.facturado, Gastos: r.gastos, 'Rentabilidad neta': r.neto }));
    rentRows.push({ Mes: 'TOTAL', Facturado: rentabilidad.totales.facturado, Gastos: rentabilidad.totales.gastos, 'Rentabilidad neta': rentabilidad.totales.neto });
    const wsRent = XLSX.utils.json_to_sheet(rentRows);
    wsRent['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsRent, 'Rentabilidad');

    const consRows = consumo.map(c => ({
      Patente: c.vehicle.patente, 'Km recorridos': c.km, 'Litros cargados': c.litros,
      'L/100km': c.l100km ? Math.round(c.l100km * 100) / 100 : '', 'Gasto combustible': c.gastoCombustible,
    }));
    const wsCons = XLSX.utils.json_to_sheet(consRows);
    wsCons['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsCons, 'Consumo por vehículo');

    XLSX.writeFile(wb, `reporte_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function backupCompleto() {
    showToast('Preparando el backup, puede tardar unos segundos...', '');
    const supabase = supabaseBrowser();
    const [drivers, driverDocs, vehicleDocs, cubiertas, clientes] = await Promise.all([
      supabase.from('drivers').select('*'),
      supabase.from('driver_docs').select('*'),
      supabase.from('vehicle_docs').select('*'),
      supabase.from('vehicle_cubiertas').select('*'),
      supabase.from('clientes').select('*'),
    ]);

    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, rows: any[]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    addSheet('Vehiculos', vehicles);
    addSheet('Choferes', drivers.data || []);
    addSheet('Doc choferes', driverDocs.data || []);
    addSheet('Doc vehiculos', vehicleDocs.data || []);
    addSheet('Cubiertas', cubiertas.data || []);
    addSheet('Mantenimientos', mantenimientos);
    addSheet('Pagos vehiculos', pagos);
    addSheet('Viajes', trips);
    addSheet('Combustible', fuel);
    addSheet('Facturas', invoices);
    addSheet('Clientes', clientes.data || []);

    XLSX.writeFile(wb, `backup_transporte_meza_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Backup descargado', 'success');
  }

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div>;

  return (
    <>
      <div id="topbar">
        <div><h1>Reportes</h1><div className="sub">Rentabilidad, consumo por vehículo y backup de todos tus datos</div></div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={exportReporte}>Descargar reporte</button>
          <button className="btn btn-primary" onClick={backupCompleto}>Backup completo</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="card stat-card"><div className="stat-label">Total facturado</div><div className="stat-value">{fmtMoney(rentabilidad.totales.facturado)}</div></div>
        <div className="card stat-card"><div className="stat-label">Total gastos (combustible + mantenimiento + pagos)</div><div className="stat-value">{fmtMoney(rentabilidad.totales.gastos)}</div></div>
        <div className="card stat-card"><div className="stat-label">Rentabilidad neta</div><div className={`stat-value ${rentabilidad.totales.neto < 0 ? 'danger' : ''}`}>{fmtMoney(rentabilidad.totales.neto)}</div></div>
      </div>

      <div className="section-head"><h3 style={{ fontSize: 18 }}>Rentabilidad por mes</h3></div>
      <div className="card table-wrap" style={{ marginBottom: 24 }}>
        {rentabilidad.rows.length === 0 ? (
          <div className="empty"><h3>Todavía no hay suficientes datos</h3><p>Cargá facturas y gastos (combustible, mantenimiento, pagos) para ver la rentabilidad por mes.</p></div>
        ) : (
          <table>
            <thead><tr><th>Mes</th><th>Facturado</th><th>Gastos</th><th>Rentabilidad neta</th></tr></thead>
            <tbody>
              {rentabilidad.rows.slice().reverse().map(r => (
                <tr key={r.mes}>
                  <td>{r.mes}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMoney(r.facturado)}</td>
                  <td>{fmtMoney(r.gastos)}</td>
                  <td style={{ fontWeight: 600, color: r.neto < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtMoney(r.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section-head"><h3 style={{ fontSize: 18 }}>Consumo por vehículo</h3></div>
      <div className="card table-wrap">
        {consumo.length === 0 ? (
          <div className="empty"><h3>Todavía no hay suficientes datos</h3><p>Cargá viajes (con km) y cargas de combustible por vehículo para ver el consumo.</p></div>
        ) : (
          <table>
            <thead><tr><th>Vehículo</th><th>Km recorridos</th><th>Litros cargados</th><th>L/100km</th><th>Gasto combustible</th></tr></thead>
            <tbody>
              {consumo.map(c => (
                <tr key={c.vehicle.id}>
                  <td style={{ fontWeight: 600 }}>{c.vehicle.patente}</td>
                  <td>{c.km.toLocaleString('es-AR')} km</td>
                  <td>{c.litros.toLocaleString('es-AR')} L</td>
                  <td>{c.l100km ? `${c.l100km.toFixed(1)} L` : '—'}</td>
                  <td>{fmtMoney(c.gastoCombustible)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
