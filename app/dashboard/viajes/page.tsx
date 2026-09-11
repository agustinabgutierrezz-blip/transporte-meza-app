'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate, fmtKm, fmtMoney, uid } from '@/lib/utils';
import { Modal, ScanModal, useToast } from '@/components/ui';
import { Driver, Tarifa, Trip, Vehicle, findTarifa, findTarifaByZona, CATEGORIAS_VIAJE } from '@/lib/types';

function normPatente(s: string) { return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
function nameTokens(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function namesMatch(a: string, b: string) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const shorter = ta.length <= tb.length ? ta : tb;
  const longer = ta.length <= tb.length ? tb : ta;
  const common = shorter.filter(t => longer.includes(t)).length;
  return common >= Math.min(shorter.length, 2);
}
function excelDateToStr(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  }
  return null;
}
function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}
function extractZona(desc: any): string | null {
  if (!desc) return null;
  const m = String(desc).match(/zona\s*\d+/i);
  return m ? m[0].replace(/\s+/, ' ').replace(/^./, c => c.toUpperCase()) : null;
}

export default function ViajesPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [prefill, setPrefill] = useState<Partial<Trip> | null>(null);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();

  // Estado del formulario (para calcular la sugerencia de tarifa en vivo)
  const [fVehiculoId, setFVehiculoId] = useState('');
  const [fKm, setFKm] = useState<string>('');
  const [fZona, setFZona] = useState<string>('');
  const [fCategoria, setFCategoria] = useState<string>('');
  const [fCosto, setFCosto] = useState<string>('');
  const [fTienePeon, setFTienePeon] = useState(false);
  const [fCostoPeon, setFCostoPeon] = useState<string>('');

  async function load() {
    const supabase = supabaseBrowser();
    const [t, v, d, tf] = await Promise.all([
      supabase.from('trips').select('*').order('fecha', { ascending: false }),
      supabase.from('vehicles').select('*'),
      supabase.from('drivers').select('*'),
      supabase.from('tarifas').select('*'),
    ]);
    setTrips(t.data || []); setVehicles(v.data || []); setDrivers(d.data || []); setTarifas(tf.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => trips
    .filter(t => !filterVehicle || t.vehicle_id === filterVehicle)
    .filter(t => !filterMonth || t.fecha?.slice(0, 7) === filterMonth), [trips, filterVehicle, filterMonth]);

  const resumenMes = useMemo(() => {
    if (!filterMonth) return null;
    const total = filtered.reduce((s, t) => s + (Number(t.costo_estimado) || 0), 0);
    return { cantidad: filtered.length, total };
  }, [filtered, filterMonth]);

  const zonasExistentes = useMemo(() => Array.from(new Set(tarifas.map(t => t.zona).filter(Boolean))) as string[], [tarifas]);
  const vehiculoSel = vehicles.find(v => v.id === fVehiculoId);
  const sugerenciaZona = findTarifaByZona(tarifas, vehiculoSel?.tipo_unidad, fZona || null);
  const sugerenciaKm = findTarifa(tarifas, vehiculoSel?.tipo_unidad, fKm ? Number(fKm) : null);
  const sugerencia = sugerenciaZona || sugerenciaKm;

  function openForm(t: Trip | null, pf: Partial<Trip> | null) {
    setEditing(t); setPrefill(pf);
    const form = t || pf;
    setFVehiculoId(form?.vehicle_id || '');
    setFKm(form?.km !== undefined && form?.km !== null ? String(form.km) : '');
    setFZona(form?.zona || '');
    setFCategoria(form?.categoria || '');
    setFCosto(form?.costo_estimado !== undefined && form?.costo_estimado !== null ? String(form.costo_estimado) : '');
    setFTienePeon(!!form?.tiene_peon);
    setFCostoPeon(form?.costo_peon !== undefined && form?.costo_peon !== null ? String(form.costo_peon) : '');
    setFormOpen(true);
  }

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
      km: fKm ? Number(fKm) : null,
      zona: fZona || null,
      categoria: fCategoria || null,
      notas: String(fd.get('notas') || '').trim(),
      costo_estimado: fCosto ? Number(fCosto) : null,
      tiene_peon: fTienePeon,
      costo_peon: fTienePeon && fCostoPeon ? Number(fCostoPeon) : null,
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

  async function vaciarViajes() {
    if (trips.length === 0) return;
    const primero = confirm(`Esto va a borrar TODOS tus ${trips.length} viajes cargados. No se puede deshacer. ¿Continuar?`);
    if (!primero) return;
    const segundo = confirm('Confirmá de nuevo: se van a eliminar todos los viajes para que puedas reimportar desde cero.');
    if (!segundo) return;
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('trips').delete().eq('owner', user!.id);
    if (error) { showToast('No se pudo vaciar. Probá de nuevo.', 'error'); return; }
    showToast('Viajes eliminados', 'success');
    load();
  }

  function exportExcel() {
    if (trips.length === 0) { showToast('No hay viajes para exportar', 'error'); return; }
    const rows = [...trips].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map(t => {
      const v = vehicles.find(v => v.id === t.vehicle_id);
      const dr = drivers.find(d => d.id === t.driver_id);
      return {
        Fecha: fmtDate(t.fecha), Patente: v?.patente || '', Vehiculo: v ? `${v.marca} ${v.modelo}` : '', Chofer: dr?.nombre || '',
        Origen: t.origen || '', Destino: t.destino || '', Km: t.km || '', Zona: t.zona || '', Categoria: t.categoria || '',
        'Costo estimado': t.costo_estimado || '', Peon: t.tiene_peon ? 'Sí' : 'No', 'Costo peón': t.costo_peon || '',
        Observaciones: t.notas || '',
      };
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
    setScanOpen(false);
    openForm(null, {
      fecha: extracted.fecha || new Date().toISOString().slice(0, 10),
      vehicle_id: vehiculoId || null,
      driver_id: choferId || null,
      origen: extracted.origen || '',
      destino: extracted.destino || '',
      km: extracted.km || null,
      notas: extracted.observaciones || '',
    });
    showToast('Datos leídos. Revisalos antes de guardar.', 'success');
  }

  async function handleImportViajes(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

      const marcadores = ['documento viaje', 'vehículo tractor', 'vehiculo tractor', 'fecha de salida', 'kilómetros', 'kilometros'];
      let headerRowIdx = -1;
      let headerMap: Record<string, number> = {};
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i] || [];
        const found: Record<string, number> = {};
        row.forEach((cell, ci) => {
          if (typeof cell === 'string' && cell.trim()) found[cell.trim().toLowerCase()] = ci;
        });
        const hits = marcadores.filter(m => found[m] !== undefined).length;
        if (hits >= 2) { headerRowIdx = i; headerMap = found; break; }
      }
      if (headerRowIdx === -1) {
        showToast('No reconocí el formato de ese Excel. Probá con otro archivo o cargá los viajes a mano.', 'error');
        setImporting(false);
        return;
      }

      const col = (...names: string[]) => {
        for (const n of names) { if (headerMap[n] !== undefined) return headerMap[n]; }
        return -1;
      };
      const cDocumento = col('documento viaje');
      const cFechaSalida = col('fecha de salida');
      const cFechaGen = col('fecha de generación', 'fecha de generacion');
      const cKm = col('kilómetros', 'kilometros', 'kms');
      const cPatente = col('vehículo tractor', 'vehiculo tractor');
      const cChofer = col('chofer - apellido y nombre');
      const cAyudante = col('ayudante - apellido y nombre');
      const cVenta = col('importe venta');
      const cCliente = col('cliente - razón social', 'cliente - razon social');
      const cOrigenRs = col('origen - razón social', 'origen - razon social');
      const cOrigenLoc = col('origen - localidad');
      const cDestinoRs = col('destino - razón social', 'destino - razon social');
      const cDestinoLoc = col('destino - localidad');
      const cObs = col('observaciones');
      const cTipoViajeDesc = col('tipo viaje - descripción', 'tipo viaje - descripcion');
      const cTipoViajeCod = col('tipo viaje - código', 'tipo viaje - codigo');

      const candidatas: any[] = [];
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const documento = cDocumento >= 0 ? row[cDocumento] : null;
        const patenteRaw = cPatente >= 0 ? row[cPatente] : null;
        const fecha = excelDateToStr(cFechaSalida >= 0 ? row[cFechaSalida] : null) || excelDateToStr(cFechaGen >= 0 ? row[cFechaGen] : null);
        if (!documento && !patenteRaw && !fecha) continue; // fila vacía

        const vehiculoId = patenteRaw ? vehicles.find(v => normPatente(v.patente) === normPatente(String(patenteRaw)))?.id : null;
        const vehiculo = vehiculoId ? vehicles.find(v => v.id === vehiculoId) : null;
        const choferNombre = cChofer >= 0 ? row[cChofer] : null;
        const choferId = choferNombre ? drivers.find(d => namesMatch(d.nombre, String(choferNombre)))?.id : null;
        const ayudante = cAyudante >= 0 ? row[cAyudante] : null;
        const cliente = cCliente >= 0 ? row[cCliente] : null;
        const origen = (cOrigenRs >= 0 && row[cOrigenRs]) || (cOrigenLoc >= 0 ? row[cOrigenLoc] : null);
        const destino = (cDestinoRs >= 0 && row[cDestinoRs]) || (cDestinoLoc >= 0 ? row[cDestinoLoc] : null);
        const obs = cObs >= 0 ? row[cObs] : null;
        const tipoDesc = cTipoViajeDesc >= 0 ? row[cTipoViajeDesc] : null;
        const tipoCod = cTipoViajeCod >= 0 ? row[cTipoViajeCod] : null;
        const zona = extractZona(tipoDesc);
        const categoria = (!zona && tipoDesc) ? String(tipoDesc).trim() : null;
        const tienePeon = /pop|peon/i.test(String(tipoDesc || '')) || /pop/i.test(String(tipoCod || '')) || !!ayudante;
        const km = cKm >= 0 ? toNumber(row[cKm]) : null;

        // Prioridad del costo: 1) Importe Venta del archivo, 2) tarifa por zona, 3) tarifa por km
        let costo = cVenta >= 0 ? toNumber(row[cVenta]) : null;
        if (!costo && vehiculo?.tipo_unidad) {
          const tz = zona ? findTarifaByZona(tarifas, vehiculo.tipo_unidad, zona) : null;
          const tk = !tz && km ? findTarifa(tarifas, vehiculo.tipo_unidad, km) : null;
          costo = tz?.precio ?? tk?.precio ?? null;
        }

        const notasParts = [];
        if (documento) notasParts.push(`HR ${documento}`);
        if (cliente) notasParts.push(`Cliente: ${cliente}`);
        if (ayudante) notasParts.push(`Ayudante: ${ayudante}`);
        if (obs) notasParts.push(String(obs));

        candidatas.push({
          fecha: fecha || new Date().toISOString().slice(0, 10),
          vehicle_id: vehiculoId || null,
          driver_id: choferId || null,
          origen: origen ? String(origen) : '',
          destino: destino ? String(destino) : '',
          km,
          zona,
          categoria,
          costo_estimado: costo,
          tiene_peon: tienePeon,
          notas: notasParts.join(' · '),
        });
      }

      if (candidatas.length === 0) {
        showToast('No encontré filas de viajes para importar en ese archivo.', 'error');
        setImporting(false);
        return;
      }

      const sinVehiculo = candidatas.filter(c => !c.vehicle_id).length;
      const sinChofer = candidatas.filter(c => !c.driver_id).length;
      const sinCosto = candidatas.filter(c => !c.costo_estimado).length;
      const conPeon = candidatas.filter(c => c.tiene_peon).length;
      const vehiculosSinTipo = new Set(
        candidatas.filter(c => c.vehicle_id && !c.costo_estimado)
          .map(c => vehicles.find(v => v.id === c.vehicle_id))
          .filter(v => v && !v.tipo_unidad)
          .map(v => v!.patente)
      );
      const confirmMsg = `Encontré ${candidatas.length} viajes para importar.` +
        (sinVehiculo ? `\n${sinVehiculo} sin vehículo identificado.` : '') +
        (sinChofer ? `\n${sinChofer} sin chofer identificado.` : '') +
        (sinCosto ? `\n${sinCosto} sin costo (ni en el Excel ni en el tarifario para su zona/km).` : '') +
        (vehiculosSinTipo.size ? `\nOjo: ${Array.from(vehiculosSinTipo).join(', ')} no ${vehiculosSinTipo.size === 1 ? 'tiene' : 'tienen'} "Tipo de unidad" cargado en Flota — por eso no se pudo calcular su costo por tarifario. Cargalo y volvé a importar para que tome el precio.` : '') +
        (conPeon ? `\n${conPeon} marcados con peón.` : '') +
        `\n\n¿Confirmás la importación?`;
      if (!confirm(confirmMsg)) { setImporting(false); return; }

      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      const batchSize = 200;
      let importados = 0;
      for (let i = 0; i < candidatas.length; i += batchSize) {
        const batch = candidatas.slice(i, i + batchSize).map(c => ({ owner: user!.id, ...c }));
        const { error } = await supabase.from('trips').insert(batch);
        if (error) { showToast(`Se importaron ${importados} viajes antes de un error. Probá de nuevo con el resto.`, 'error'); setImporting(false); load(); return; }
        importados += batch.length;
      }
      showToast(`${importados} viajes importados`, 'success');
      load();
    } catch (e) {
      showToast('No se pudo leer el archivo. Verificá que sea un Excel válido.', 'error');
    }
    setImporting(false);
  }

  const form = editing || prefill;

  return (
    <>
      <div id="topbar">
        <div><h1>Viajes</h1><div className="sub">{trips.length} viaje{trips.length === 1 ? '' : 's'} registrado{trips.length === 1 ? '' : 's'}</div></div>
        <div className="topbar-actions">
          <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportViajes(f); e.target.value = ''; }} />
          <button className="btn btn-secondary" onClick={() => importRef.current?.click()} disabled={importing}>
            {importing ? 'Importando...' : 'Importar Excel de viajes'}
          </button>
          <button className="btn btn-secondary" onClick={() => setScanOpen(true)}>Escanear hoja de ruta</button>
          <button className="btn btn-primary" onClick={() => openForm(null, null)}>+ Cargar viaje</button>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportExcel}>Descargar Excel</button>
          {trips.length > 0 && <button className="btn btn-danger-outline" onClick={vaciarViajes}>Vaciar todos los viajes</button>}
        </div>
      </div>

      {resumenMes && (
        <div className="card card-pad" style={{ marginBottom: 16, fontSize: 14 }}>
          <strong>{filterMonth}</strong>: {resumenMes.cantidad} viaje{resumenMes.cantidad === 1 ? '' : 's'}, {fmtMoney(resumenMes.total)} en costo estimado total.
        </div>
      )}

      <div className="card table-wrap">
        {loading ? <div className="empty">Cargando...</div> : filtered.length === 0 ? (
          <div className="empty"><h3>Sin viajes para mostrar</h3><p>Cargá un viaje manualmente, escaneá una hoja de ruta, o importá un Excel.</p></div>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Vehículo</th><th>Chofer</th><th>Recorrido</th><th>Zona</th><th>Categoría</th><th>Km</th><th>Costo estimado</th><th>Peón</th><th></th></tr></thead>
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
                    <td>{t.zona || '—'}</td>
                    <td>{t.categoria || '—'}</td>
                    <td>{fmtKm(t.km)}</td>
                    <td>{t.costo_estimado ? fmtMoney(t.costo_estimado) : '—'}</td>
                    <td>{t.tiene_peon ? <span className="badge warn"><span className="dot" />Sí</span> : '—'}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => openForm(t, null)}>Editar</button>
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
        <form onSubmit={saveTrip} key={editing?.id || (prefill ? 'prefilled' : 'new')}>
          <div className="modal-head"><h2>{editing ? 'Editar viaje' : 'Cargar viaje'}</h2><button type="button" className="modal-close" onClick={() => setFormOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={form?.fecha || new Date().toISOString().slice(0, 10)} /></div>
              <div className="field"><label>Kilómetros recorridos</label><input name="km" type="number" value={fKm} onChange={e => setFKm(e.target.value)} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Vehículo</label>
                <select name="vehiculo" value={fVehiculoId} onChange={e => setFVehiculoId(e.target.value)}>
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
            <div className="field">
              <label>Zona (opcional)</label>
              <input value={fZona} onChange={e => setFZona(e.target.value)} list="zonas-existentes" placeholder="Ej: Zona 1" />
              <datalist id="zonas-existentes">{zonasExistentes.map(z => <option key={z} value={z} />)}</datalist>
            </div>
            <div className="field">
              <label>Categoría / observación especial (opcional)</label>
              <input value={fCategoria} onChange={e => setFCategoria(e.target.value)} list="categorias-viaje" placeholder="Ej: TEMPERATURA CONTROLADA" />
              <datalist id="categorias-viaje">{CATEGORIAS_VIAJE.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="field">
              <label>Costo estimado del viaje</label>
              <input type="number" step="0.01" value={fCosto} onChange={e => setFCosto(e.target.value)} placeholder="0" />
              {vehiculoSel && !vehiculoSel.tipo_unidad && (
                <div className="field-hint">Este vehículo no tiene "tipo de unidad" cargado — asignaselo en Flota para que la app pueda sugerirte el costo.</div>
              )}
              {sugerencia && (
                <div className="field-hint">
                  Sugerido según tarifario ({sugerenciaZona ? 'por zona' : 'por km'}): <strong>{fmtMoney(sugerencia.precio)}</strong>{' '}
                  <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setFCosto(String(sugerencia.precio))}>Usar</button>
                </div>
              )}
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--ink)' }}>
                <input type="checkbox" checked={fTienePeon} onChange={e => setFTienePeon(e.target.checked)} style={{ width: 'auto' }} />
                Este viaje llevó peón
              </label>
            </div>
            {fTienePeon && (
              <div className="field"><label>Costo del peón</label><input type="number" step="0.01" value={fCostoPeon} onChange={e => setFCostoPeon(e.target.value)} placeholder="0" /></div>
            )}
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
