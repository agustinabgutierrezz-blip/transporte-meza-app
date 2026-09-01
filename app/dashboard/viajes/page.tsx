'use client';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate, fmtKm, uid } from '@/lib/utils';
import { Modal, ScanModal, useToast } from '@/components/ui';
import { Driver, Trip, Vehicle } from '@/lib/types';

export default function ViajesPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [prefill, setPrefill] = useState<Partial<Trip> | null>(null);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const [t, v, d] = await Promise.all([
      supabase.from('trips').select('*').order('fecha', { ascending: false }),
      supabase.from('vehicles').select('*'),
      supabase.from('drivers').select('*'),
    ]);
    setTrips(t.data || []); setVehicles(v.data || []); setDrivers(d.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => trips
    .filter(t => !filterVehicle || t.vehicle_id === filterVehicle)
    .filter(t => !filterMonth || t.fecha?.slice(0, 7) === filterMonth), [trips, filterVehicle, filterMonth]);

  async function saveTrip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const data = {
      fecha: fd.get('fecha') || null,
      vehicle_id: fd.get('vehiculo') || null,
      driver_id: fd.get('chofer') || null,
      origen: String(fd.get('origen') || '').trim(),
      destino: String(fd.get('destino') || '').trim(),
      km: Number(fd.get('km')) || null,
      notas: String(fd.get('notas') || '').trim(),
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('trips').update(data).eq('id', editing.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from('trips').insert({ owner: user!.id, ...data }));
    }
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Viaje guardado', 'success');
    setFormOpen(false); setEditing(null); setPrefill(null);
    load();
  }

  async function deleteTrip(id: string) {
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar. Probá de nuevo.', 'error'); return; }
    showToast('Viaje eliminado', 'success');
    load();
  }

  function exportExcel() {
    if (trips.length === 0) { showToast('No hay viajes para exportar', 'error'); return; }
    const rows = [...trips].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map(t => {
      const v = vehicles.find(v => v.id === t.vehicle_id);
      const dr = drivers.find(d => d.id === t.driver_id);
      return { Fecha: fmtDate(t.fecha), Patente: v?.patente || '', Vehiculo: v ? `${v.marca} ${v.modelo}` : '', Chofer: dr?.nombre || '', Origen: t.origen || '', Destino: t.destino || '', Km: t.km || '', Observaciones: t.notas || '' };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Viajes');
    XLSX.writeFile(wb, `viajes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleExtracted(extracted: any) {
    const vehiculoId = extracted.patente ? vehicles.find(v => v.patente.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === String(extracted.patente).replace(/[^A-Za-z0-9]/g, '').toUpperCase())?.id : null;
    const nombreNorm = extracted.chofer?.trim().toLowerCase();
    const choferId = nombreNorm ? drivers.find(d => d.nombre.trim().toLowerCase().includes(nombreNorm) || nombreNorm.includes(d.nombre.trim().toLowerCase()))?.id : null;
    setPrefill({
      fecha: extracted.fecha || new Date().toISOString().slice(0, 10),
      vehicle_id: vehiculoId || null,
      driver_id: choferId || null,
      origen: extracted.origen || '',
      destino: extracted.destino || '',
      km: extracted.km || null,
      notas: extracted.observaciones || '',
    });
    setScanOpen(false);
    setEditing(null);
    setFormOpen(true);
    showToast('Datos leídos. Revisalos antes de guardar.', 'success');
  }

  const form = editing || prefill;

  return (
    <>
      <div id="topbar">
        <div><h1>Viajes</h1><div className="sub">{trips.length} viaje{trips.length === 1 ? '' : 's'} registrado{trips.length === 1 ? '' : 's'}</div></div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={() => setScanOpen(true)}>Escanear hoja de ruta</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setPrefill(null); setFormOpen(true); }}>+ Cargar viaje</button>
        </div>
      </div>

      <div className="section-head">
        <div className="filters">
          <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}>
            <option value="">Todos los vehículos</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.patente} · {v.marca} {v.modelo}</option>)}
          </select>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={exportExcel}>Descargar Excel</button>
      </div>

      <div className="card table-wrap">
        {loading ? <div className="empty">Cargando...</div> : filtered.length === 0 ? (
          <div className="empty"><h3>Sin viajes para mostrar</h3><p>Cargá un viaje manualmente o escaneá una hoja de ruta.</p></div>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Vehículo</th><th>Chofer</th><th>Recorrido</th><th>Km</th><th></th></tr></thead>
            <tbody>
              {filtered.map(t => {
                const v = vehicles.find(v => v.id === t.vehicle_id);
                const dr = drivers.find(d => d.id === t.driver_id);
                return (
                  <tr key={t.id}>
                    <td>{fmtDate(t.fecha)}</td>
                    <td>{v ? v.patente : '—'}</td>
                    <td>{dr?.nombre || '—'}</td>
                    <td>{t.origen || '—'} → {t.destino || '—'}</td>
                    <td>{fmtKm(t.km)}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => { setEditing(t); setPrefill(null); setFormOpen(true); }}>Editar</button>
                      <button className="btn btn-ghost" onClick={() => deleteTrip(t.id)}>Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }}>
        <form onSubmit={saveTrip} key={editing?.id || 'new'}>
          <div className="modal-head"><h2>{editing ? 'Editar viaje' : 'Cargar viaje'}</h2><button type="button" className="modal-close" onClick={() => setFormOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={form?.fecha || new Date().toISOString().slice(0, 10)} /></div>
              <div className="field"><label>Kilómetros recorridos</label><input name="km" type="number" defaultValue={form?.km || ''} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Vehículo</label>
                <select name="vehiculo" defaultValue={form?.vehicle_id || ''}>
                  <option value="">Seleccionar vehículo</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.patente} · {v.marca} {v.modelo}</option>)}
                </select>
              </div>
              <div className="field"><label>Chofer</label>
                <select name="chofer" defaultValue={form?.driver_id || ''}>
                  <option value="">Sin asignar</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field"><label>Origen</label><input name="origen" defaultValue={form?.origen || ''} /></div>
              <div className="field"><label>Destino</label><input name="destino" defaultValue={form?.destino || ''} /></div>
            </div>
            <div className="field"><label>Observaciones</label><textarea name="notas" rows={2} defaultValue={form?.notas || ''} /></div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      <ScanModal open={scanOpen} kind="viaje" onClose={() => setScanOpen(false)} onExtracted={handleExtracted} />
    </>
  );
}
