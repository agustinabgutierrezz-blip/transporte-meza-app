'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtMoney } from '@/lib/utils';
import { Modal, useToast } from '@/components/ui';
import { Tarifa } from '@/lib/types';

function parsePrecio(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  // Formato argentino: punto = miles, coma = decimales
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return isNaN(n) ? null : n;
}

function parseRango(label: string): { desde: number; hasta: number | null } | null {
  const clean = label.trim();
  const rangeMatch = clean.match(/^(\d+)\s*[-–a]\s*(\d+)$/i);
  if (rangeMatch) return { desde: Number(rangeMatch[1]), hasta: Number(rangeMatch[2]) };
  const plusMatch = clean.match(/^(\d+)\s*\+/);
  if (plusMatch) return { desde: Number(plusMatch[1]), hasta: null };
  return null;
}

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tarifa | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from('tarifas').select('*').order('tipo_unidad').order('km_desde');
    setTarifas(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const grupos = useMemo(() => {
    const map: Record<string, Tarifa[]> = {};
    tarifas.forEach(t => { (map[t.tipo_unidad] = map[t.tipo_unidad] || []).push(t); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tarifas]);

  const tiposExistentes = useMemo(() => Array.from(new Set(tarifas.map(t => t.tipo_unidad))), [tarifas]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tipo_unidad = String(fd.get('tipo_unidad') || '').trim();
    const km_desde = Number(fd.get('km_desde')) || 0;
    const kmHastaRaw = String(fd.get('km_hasta') || '').trim();
    const km_hasta = kmHastaRaw === '' ? null : Number(kmHastaRaw);
    const precio = Number(fd.get('precio')) || null;
    if (!tipo_unidad || !precio) { showToast('Completá el tipo de unidad y el precio', 'error'); return; }
    const supabase = supabaseBrowser();
    let error;
    if (editing) {
      ({ error } = await supabase.from('tarifas').update({ tipo_unidad, km_desde, km_hasta, precio }).eq('id', editing.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from('tarifas').insert({ owner: user!.id, tipo_unidad, km_desde, km_hasta, precio }));
    }
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Tarifa guardada', 'success');
    setOpen(false); setEditing(null);
    load();
  }

  async function deleteTarifa(id: string) {
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('tarifas').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar', 'error'); return; }
    showToast('Tarifa eliminada', 'success');
    load();
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Buscar la fila de encabezados: la que tiene más de una celda con forma "31-60"
      let headerRowIdx = -1;
      let bandCols: { col: number; desde: number; hasta: number | null }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const cols: { col: number; desde: number; hasta: number | null }[] = [];
        rows[i].forEach((cell, ci) => {
          if (typeof cell === 'string') {
            const r = parseRango(cell);
            if (r) cols.push({ col: ci, ...r });
          }
        });
        if (cols.length >= 2) { headerRowIdx = i; bandCols = cols; break; }
      }
      if (headerRowIdx === -1) {
        showToast('No pude reconocer el formato del Excel. Probá cargar las tarifas a mano.', 'error');
        setImporting(false);
        return;
      }

      const nuevas: { tipo_unidad: string; km_desde: number; km_hasta: number | null; precio: number }[] = [];
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const tipo = row[0];
        if (!tipo || typeof tipo !== 'string' || !tipo.trim()) continue;
        bandCols.forEach(b => {
          const precio = parsePrecio(row[b.col]);
          if (precio !== null && precio > 0) {
            nuevas.push({ tipo_unidad: tipo.trim(), km_desde: b.desde, km_hasta: b.hasta, precio });
          }
        });
      }

      if (nuevas.length === 0) {
        showToast('No encontré filas de tarifas para importar en ese archivo.', 'error');
        setImporting(false);
        return;
      }

      const ok = confirm(`Encontré ${nuevas.length} tarifas en el archivo. Esto va a reemplazar TODAS tus tarifas actuales por estas. ¿Continuar?`);
      if (!ok) { setImporting(false); return; }

      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('tarifas').delete().eq('owner', user!.id);
      const { error } = await supabase.from('tarifas').insert(nuevas.map(n => ({ owner: user!.id, ...n })));
      if (error) { showToast('No se pudo importar. Probá de nuevo.', 'error'); setImporting(false); return; }
      showToast(`${nuevas.length} tarifas importadas`, 'success');
      load();
    } catch (e) {
      showToast('No se pudo leer el archivo. Verificá que sea un Excel válido.', 'error');
    }
    setImporting(false);
  }

  return (
    <>
      <div id="topbar">
        <div><h1>Tarifas</h1><div className="sub">Cuadro tarifario por tipo de unidad y km recorridos</div></div>
        <div className="topbar-actions">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Importando...' : 'Importar desde Excel'}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setOpen(true); }}>+ Agregar tarifa</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20, fontSize: 13, color: 'var(--ink-soft)' }}>
        Subís tu Excel con una columna "Tipo de Unidad" y columnas de rango en km (ej. "0-30", "31-60"), y la app arma la tabla sola.
        También podés cargar o editar cada tarifa a mano. Una vez cargadas, en <strong>Viajes</strong> la app te va a sugerir el costo automáticamente
        según el tipo de unidad del vehículo y los km del viaje.
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div> :
        grupos.length === 0 ? (
          <div className="card empty">
            <h3>Todavía no cargaste tarifas</h3>
            <p>Importá tu Excel o agregá la primera tarifa a mano.</p>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Agregar tarifa</button>
          </div>
        ) : (
          grupos.map(([tipo, items]) => (
            <div key={tipo} className="card table-wrap" style={{ marginBottom: 16 }}>
              <div style={{ padding: '14px 18px 4px', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 18 }}>{tipo}</div>
              <table>
                <thead><tr><th>Rango (km)</th><th>Precio</th><th></th></tr></thead>
                <tbody>
                  {items.sort((a, b) => a.km_desde - b.km_desde).map(t => (
                    <tr key={t.id}>
                      <td>{t.km_desde} - {t.km_hasta ?? '+'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtMoney(t.precio)}</td>
                      <td>
                        <button className="btn btn-ghost" onClick={() => { setEditing(t); setOpen(true); }}>Editar</button>
                        <button className="btn btn-ghost" onClick={() => deleteTarifa(t.id)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }}>
        <form onSubmit={save} key={editing?.id || 'new'}>
          <div className="modal-head"><h2>{editing ? 'Editar tarifa' : 'Agregar tarifa'}</h2><button type="button" className="modal-close" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field">
              <label>Tipo de unidad</label>
              <input name="tipo_unidad" list="tipos-unidad" defaultValue={editing?.tipo_unidad || ''} placeholder="Ej: Liviano 4500 kg." />
              <datalist id="tipos-unidad">{tiposExistentes.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div className="field-row">
              <div className="field"><label>Desde (km)</label><input name="km_desde" type="number" defaultValue={editing?.km_desde ?? 0} /></div>
              <div className="field"><label>Hasta (km, vacío = sin límite)</label><input name="km_hasta" type="number" defaultValue={editing?.km_hasta ?? ''} /></div>
            </div>
            <div className="field"><label>Precio</label><input name="precio" type="number" step="0.01" defaultValue={editing?.precio || ''} /></div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
