'use client';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate, fmtMoney } from '@/lib/utils';
import { Modal, ScanModal, useToast } from '@/components/ui';
import { Fuel, Vehicle } from '@/lib/types';

export default function CombustiblePage() {
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<Fuel | null>(null);
  const [prefill, setPrefill] = useState<Partial<Fuel> | null>(null);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const [f, v] = await Promise.all([
      supabase.from('fuel').select('*').order('fecha', { ascending: false }),
      supabase.from('vehicles').select('*'),
    ]);
    setFuel(f.data || []); setVehicles(v.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => fuel
    .filter(f => !filterVehicle || f.vehicle_id === filterVehicle)
    .filter(f => !filterMonth || f.fecha?.slice(0, 7) === filterMonth), [fuel, filterVehicle, filterMonth]);
  const total = fuel.reduce((s, f) => s + (Number(f.total) || 0), 0);
  const resumenMes = useMemo(() => {
    if (!filterMonth) return null;
    const totalMes = filtered.reduce((s, f) => s + (Number(f.total) || 0), 0);
    return { cantidad: filtered.length, total: totalMes };
  }, [filtered, filterMonth]);

  async function saveFuel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const data = {
      fecha: fd.get('fecha') || null,
      vehicle_id: fd.get('vehiculo') || null,
      estacion: String(fd.get('estacion') || '').trim(),
      litros: Number(fd.get('litros')) || null,
      precio_litro: Number(fd.get('precio')) || null,
      total: Number(fd.get('total')) || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('fuel').update(data).eq('id', editing.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from('fuel').insert({ owner: user!.id, ...data }));
    }
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Carga guardada', 'success');
    setFormOpen(false); setEditing(null); setPrefill(null);
    load();
  }

  async function deleteFuel(id: string) {
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('fuel').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar. Probá de nuevo.', 'error'); return; }
    showToast('Carga eliminada', 'success');
    load();
  }

  function exportExcel() {
    if (fuel.length === 0) { showToast('No hay cargas para exportar', 'error'); return; }
    const rows = [...fuel].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map(f => {
      const v = vehicles.find(v => v.id === f.vehicle_id);
      return { Fecha: fmtDate(f.fecha), Patente: v?.patente || '', Estacion: f.estacion || '', Litros: f.litros || '', PrecioLitro: f.precio_litro || '', Total: f.total || '' };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Combustible');
    XLSX.writeFile(wb, `combustible_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleExtracted(extracted: any) {
    let total = extracted.total || null;
    if (!total && extracted.litros && extracted.precioLitro) total = Math.round(extracted.litros * extracted.precioLitro * 100) / 100;
    const vehiculoId = extracted.patente ? vehicles.find(v => v.patente.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === String(extracted.patente).replace(/[^A-Za-z0-9]/g, '').toUpperCase())?.id : null;
    setPrefill({
      fecha: extracted.fecha || new Date().toISOString().slice(0, 10),
      vehicle_id: vehiculoId || null,
      estacion: extracted.estacion || 'YPF',
      litros: extracted.litros || null,
      precio_litro: extracted.precioLitro || null,
      total,
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
        <div><h1>Combustible</h1><div className="sub">{fuel.length} carga{fuel.length === 1 ? '' : 's'} registrada{fuel.length === 1 ? '' : 's'} · {fmtMoney(total)} acumulado</div></div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={() => setScanOpen(true)}>Escanear ticket de combustible</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setPrefill(null); setFormOpen(true); }}>+ Cargar combustible</button>
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

      {resumenMes && (
        <div className="card card-pad" style={{ marginBottom: 16, fontSize: 14 }}>
          <strong>{filterMonth}</strong>: {resumenMes.cantidad} carga{resumenMes.cantidad === 1 ? '' : 's'} de combustible, {fmtMoney(resumenMes.total)} en total.
        </div>
      )}

      <div className="card table-wrap">
        {loading ? <div className="empty">Cargando...</div> : filtered.length === 0 ? (
          <div className="empty"><h3>Sin cargas de combustible</h3><p>Registrá una carga manual o escaneá un ticket.</p></div>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Vehículo</th><th>Estación</th><th>Litros</th><th>$/L</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {filtered.map(f => {
                const v = vehicles.find(v => v.id === f.vehicle_id);
                return (
                  <tr key={f.id}>
                    <td>{fmtDate(f.fecha)}</td>
                    <td>{v ? v.patente : '—'}</td>
                    <td>{f.estacion || '—'}</td>
                    <td>{f.litros ? `${f.litros} L` : '—'}</td>
                    <td>{fmtMoney(f.precio_litro)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtMoney(f.total)}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => { setEditing(f); setPrefill(null); setFormOpen(true); }}>Editar</button>
                      <button className="btn btn-ghost" onClick={() => deleteFuel(f.id)}>Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }}>
        <form onSubmit={saveFuel} key={editing?.id || 'new'}>
          <div className="modal-head"><h2>{editing ? 'Editar carga' : 'Cargar combustible'}</h2><button type="button" className="modal-close" onClick={() => setFormOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={form?.fecha || new Date().toISOString().slice(0, 10)} /></div>
              <div className="field"><label>Vehículo</label>
                <select name="vehiculo" defaultValue={form?.vehicle_id || ''}>
                  <option value="">Seleccionar vehículo</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.patente} · {v.marca} {v.modelo}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>Estación de servicio</label><input name="estacion" defaultValue={form?.estacion || 'YPF'} /></div>
            <div className="field-row">
              <div className="field"><label>Litros</label><input name="litros" type="number" step="0.01" defaultValue={form?.litros || ''} /></div>
              <div className="field"><label>Precio por litro</label><input name="precio" type="number" step="0.01" defaultValue={form?.precio_litro || ''} /></div>
            </div>
            <div className="field"><label>Total</label><input name="total" type="number" step="0.01" defaultValue={form?.total || ''} /></div>
            <div className="field-hint">Podés escribir el total a mano o calcularlo con litros × precio.</div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      <ScanModal open={scanOpen} kind="combustible" onClose={() => setScanOpen(false)} onExtracted={handleExtracted} />
    </>
  );
}
