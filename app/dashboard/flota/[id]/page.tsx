'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate, fmtKm, fmtMoney } from '@/lib/utils';
import { Modal, useToast, FileField, FileThumb, DocBadge } from '@/components/ui';
import { Cubierta, Mantenimiento, Vehicle, VehicleDoc, VehiclePayment, VEHICLE_DOC_FIELDS } from '@/lib/types';

type Tab = 'datos' | 'documentacion' | 'pagos' | 'cubiertas' | 'mantenimiento';

export default function VehicleDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const showToast = useToast();
  const [v, setV] = useState<Vehicle | null>(null);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [pagos, setPagos] = useState<VehiclePayment[]>([]);
  const [cubiertas, setCubiertas] = useState<Cubierta[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [tab, setTab] = useState<Tab>('datos');
  const [editOpen, setEditOpen] = useState(false);
  const [docModal, setDocModal] = useState<{ key: string; label: string; hasVenc: boolean } | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [cubiertaOpen, setCubiertaOpen] = useState(false);
  const [mantOpen, setMantOpen] = useState(false);

  async function loadAll() {
    const supabase = supabaseBrowser();
    const [vv, dd, pp, cc, mm] = await Promise.all([
      supabase.from('vehicles').select('*').eq('id', id).single(),
      supabase.from('vehicle_docs').select('*').eq('vehicle_id', id),
      supabase.from('vehicle_payments').select('*').eq('vehicle_id', id).order('fecha', { ascending: false }),
      supabase.from('vehicle_cubiertas').select('*').eq('vehicle_id', id).order('fecha', { ascending: false }),
      supabase.from('vehicle_mantenimientos').select('*').eq('vehicle_id', id).order('fecha', { ascending: false }),
    ]);
    setV(vv.data); setDocs(dd.data || []); setPagos(pp.data || []);
    setCubiertas(cc.data || []); setMantenimientos(mm.data || []);
  }
  useEffect(() => { loadAll(); }, [id]);

  if (!v) return <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div>;

  async function saveDatos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('vehicles').update({
      patente: String(fd.get('patente') || '').trim().toUpperCase(),
      marca: String(fd.get('marca') || '').trim(),
      modelo: String(fd.get('modelo') || '').trim(),
      anio: Number(fd.get('anio')) || null,
      km: Number(fd.get('km')) || 0,
    }).eq('id', id);
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Vehículo guardado', 'success');
    setEditOpen(false);
    loadAll();
  }

  async function deleteVehicle() {
    if (!confirm('¿Eliminar este vehículo y todos sus registros?')) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar. Probá de nuevo.', 'error'); return; }
    router.push('/dashboard/flota');
  }

  return (
    <>
      <div id="topbar">
        <div><h1>{v.patente} · {v.marca} {v.modelo}</h1></div>
        <div className="topbar-actions"><button className="btn btn-secondary" onClick={() => setEditOpen(true)}>Editar datos</button></div>
      </div>
      <button className="back-link" onClick={() => router.push('/dashboard/flota')}>← Volver a Flota</button>
      <div className="subtabs">
        {(['datos', 'documentacion', 'pagos', 'cubiertas', 'mantenimiento'] as Tab[]).map(t => (
          <button key={t} className={`subtab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'datos' ? 'Datos' : t === 'documentacion' ? 'Documentación' : t === 'pagos' ? 'Pagos' : t === 'cubiertas' ? 'Cubiertas' : 'Mantenimiento'}
          </button>
        ))}
      </div>

      {tab === 'datos' && (
        <div className="card card-pad" style={{ maxWidth: 480 }}>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div><div className="stat-label">Patente</div><div style={{ marginTop: 6 }}><span className="plate"><span className="ar">RA</span><span className="num">{v.patente}</span></span></div></div>
            <div><div className="stat-label">Kilometraje actual</div><div className="entity-name" style={{ fontSize: 20, marginTop: 4 }}>{fmtKm(v.km)}</div></div>
            <div><div className="stat-label">Marca / Modelo</div><div style={{ marginTop: 4, fontWeight: 600 }}>{v.marca || '—'} {v.modelo}</div></div>
            <div><div className="stat-label">Año</div><div style={{ marginTop: 4, fontWeight: 600 }}>{v.anio || '—'}</div></div>
          </div>
        </div>
      )}

      {tab === 'documentacion' && (
        <div className="card">
          <table>
            <thead><tr><th>Documento</th><th>Archivo</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {VEHICLE_DOC_FIELDS.map(([key, label, hasVenc]) => {
                const doc = docs.find(d => d.key === key);
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    <td><FileThumb path={doc?.file_path} name={doc?.file_name} /></td>
                    <td>{hasVenc ? fmtDate(doc?.vencimiento) : '—'}</td>
                    <td>{hasVenc ? <DocBadge dateStr={doc?.vencimiento} /> : <span className={`badge ${doc?.file_path ? 'ok' : 'none'}`}><span className="dot" />{doc?.file_path ? 'Cargado' : 'Sin cargar'}</span>}</td>
                    <td><button className="btn btn-ghost" onClick={() => setDocModal({ key, label, hasVenc })}>Editar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pagos' && (
        <>
          <div className="section-head">
            <span className="entity-meta">{pagos.length} pago{pagos.length === 1 ? '' : 's'} registrado{pagos.length === 1 ? '' : 's'}</span>
            <button className="btn btn-primary" onClick={() => setPagoOpen(true)}>+ Registrar pago</button>
          </div>
          <div className="card table-wrap">
            {pagos.length === 0 ? <div className="empty"><h3>Sin pagos registrados</h3><p>Registrá pagos de seguro o servicio satelital de este vehículo.</p></div> : (
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Comprobante</th><th></th></tr></thead>
                <tbody>
                  {pagos.map(p => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.fecha)}</td><td>{p.tipo || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtMoney(p.monto)}</td>
                      <td><FileThumb path={p.file_path} name={p.file_name} /></td>
                      <td><button className="btn btn-ghost" onClick={async () => {
                        const supabase = supabaseBrowser();
                        const { error } = await supabase.from('vehicle_payments').delete().eq('id', p.id);
                        if (error) { showToast('No se pudo eliminar', 'error'); return; }
                        loadAll();
                      }}>Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'cubiertas' && (
        <>
          <div className="section-head">
            <span className="entity-meta">{cubiertas.length} rotación{cubiertas.length === 1 ? '' : 'es'} registrada{cubiertas.length === 1 ? '' : 's'}</span>
            <button className="btn btn-primary" onClick={() => setCubiertaOpen(true)}>+ Registrar rotación</button>
          </div>
          <div className="card table-wrap">
            {cubiertas.length === 0 ? <div className="empty"><h3>Sin registros</h3><p>Registrá la primera rotación de cubiertas de este vehículo.</p></div> : (
              <table><thead><tr><th>Fecha</th><th>Km</th><th>Posición</th><th>Notas</th></tr></thead>
                <tbody>{cubiertas.map(c => <tr key={c.id}><td>{fmtDate(c.fecha)}</td><td>{fmtKm(c.km)}</td><td>{c.posicion || '—'}</td><td>{c.notas || '—'}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'mantenimiento' && (
        <>
          <div className="section-head">
            <span className="entity-meta">{mantenimientos.length} evento{mantenimientos.length === 1 ? '' : 's'} registrado{mantenimientos.length === 1 ? '' : 's'}</span>
            <button className="btn btn-primary" onClick={() => setMantOpen(true)}>+ Registrar evento</button>
          </div>
          <div className="card table-wrap">
            {mantenimientos.length === 0 ? <div className="empty"><h3>Sin registros</h3><p>Registrá el primer service o reparación de este vehículo.</p></div> : (
              <table><thead><tr><th>Fecha</th><th>Km</th><th>Tipo</th><th>Costo</th><th>Taller</th></tr></thead>
                <tbody>{mantenimientos.map(m => <tr key={m.id}><td>{fmtDate(m.fecha)}</td><td>{fmtKm(m.km)}</td><td>{m.tipo || '—'}</td><td>{fmtMoney(m.costo)}</td><td>{m.taller || '—'}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ---------- Modal: editar datos ---------- */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <form onSubmit={saveDatos}>
          <div className="modal-head"><h2>Editar vehículo</h2><button type="button" className="modal-close" onClick={() => setEditOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field"><label>Patente</label><input name="patente" defaultValue={v.patente} /></div>
            <div className="field-row">
              <div className="field"><label>Marca</label><input name="marca" defaultValue={v.marca || ''} /></div>
              <div className="field"><label>Modelo</label><input name="modelo" defaultValue={v.modelo || ''} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Año</label><input name="anio" type="number" defaultValue={v.anio || ''} /></div>
              <div className="field"><label>Kilometraje actual</label><input name="km" type="number" defaultValue={v.km || ''} /></div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-danger-outline" onClick={deleteVehicle}>Eliminar</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal: documento vehículo ---------- */}
      {docModal && (
        <VehicleDocModal
          vehicleId={id} docKey={docModal.key} label={docModal.label} hasVenc={docModal.hasVenc}
          existing={docs.find(d => d.key === docModal.key)}
          onClose={() => setDocModal(null)}
          onSaved={() => { setDocModal(null); loadAll(); }}
        />
      )}

      {/* ---------- Modal: pago ---------- */}
      <PagoModal open={pagoOpen} vehicleId={id} onClose={() => setPagoOpen(false)} onSaved={() => { setPagoOpen(false); loadAll(); }} />

      {/* ---------- Modal: cubierta ---------- */}
      <Modal open={cubiertaOpen} onClose={() => setCubiertaOpen(false)}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const km = Number(fd.get('km')) || 0;
          const supabase = supabaseBrowser();
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase.from('vehicle_cubiertas').insert({
            owner: user!.id, vehicle_id: id, fecha: fd.get('fecha'), km,
            posicion: String(fd.get('posicion') || '').trim(), notas: String(fd.get('notas') || '').trim(),
          });
          if (error) { showToast('No se pudo guardar', 'error'); return; }
          if (km > (v.km || 0)) await supabase.from('vehicles').update({ km }).eq('id', id);
          showToast('Rotación registrada', 'success');
          setCubiertaOpen(false); loadAll();
        }}>
          <div className="modal-head"><h2>Rotación de cubiertas</h2><button type="button" className="modal-close" onClick={() => setCubiertaOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
              <div className="field"><label>Kilometraje</label><input name="km" type="number" /></div>
            </div>
            <div className="field"><label>Posición</label><input name="posicion" placeholder="Ej: Delantera izquierda" /></div>
            <div className="field"><label>Notas</label><textarea name="notas" rows={2} /></div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setCubiertaOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal: mantenimiento ---------- */}
      <Modal open={mantOpen} onClose={() => setMantOpen(false)}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const km = Number(fd.get('km')) || 0;
          const supabase = supabaseBrowser();
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase.from('vehicle_mantenimientos').insert({
            owner: user!.id, vehicle_id: id, fecha: fd.get('fecha'), km,
            tipo: String(fd.get('tipo') || '').trim(), costo: Number(fd.get('costo')) || 0,
            taller: String(fd.get('taller') || '').trim(), notas: String(fd.get('notas') || '').trim(),
          });
          if (error) { showToast('No se pudo guardar', 'error'); return; }
          if (km > (v.km || 0)) await supabase.from('vehicles').update({ km }).eq('id', id);
          showToast('Evento registrado', 'success');
          setMantOpen(false); loadAll();
        }}>
          <div className="modal-head"><h2>Evento de mantenimiento</h2><button type="button" className="modal-close" onClick={() => setMantOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
              <div className="field"><label>Kilometraje</label><input name="km" type="number" /></div>
            </div>
            <div className="field"><label>Tipo</label><input name="tipo" placeholder="Service / cambio de aceite / frenos..." /></div>
            <div className="field-row">
              <div className="field"><label>Costo</label><input name="costo" type="number" /></div>
              <div className="field"><label>Taller</label><input name="taller" /></div>
            </div>
            <div className="field"><label>Notas</label><textarea name="notas" rows={2} /></div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setMantOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function VehicleDocModal({ vehicleId, docKey, label, hasVenc, existing, onClose, onSaved }: {
  vehicleId: string; docKey: string; label: string; hasVenc: boolean;
  existing?: VehicleDoc; onClose: () => void; onSaved: () => void;
}) {
  const showToast = useToast();
  const [file, setFile] = useState<{ path: string; name: string } | null>(
    existing?.file_path ? { path: existing.file_path, name: existing.file_name || '' } : null
  );

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('vehicle_docs').upsert({
      owner: user!.id, vehicle_id: vehicleId, key: docKey,
      vencimiento: hasVenc ? (fd.get('venc') || null) : null,
      file_path: file?.path || null, file_name: file?.name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vehicle_id,key' });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Documento actualizado', 'success');
    onSaved();
  }

  return (
    <Modal open onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-head"><h2>{label}</h2><button type="button" className="modal-close" onClick={onClose}>&times;</button></div>
        <div className="modal-body">
          {hasVenc && <div className="field"><label>Fecha de vencimiento</label><input name="venc" type="date" defaultValue={existing?.vencimiento || ''} /></div>}
          <FileField label="Foto o PDF" folder={`vehiculos/${vehicleId}`} currentPath={file?.path} currentName={file?.name} onUploaded={setFile} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function PagoModal({ open, vehicleId, onClose, onSaved }: { open: boolean; vehicleId: string; onClose: () => void; onSaved: () => void }) {
  const showToast = useToast();
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('vehicle_payments').insert({
      owner: user!.id, vehicle_id: vehicleId, fecha: fd.get('fecha'), tipo: fd.get('tipo'),
      monto: Number(fd.get('monto')) || null, file_path: file?.path || null, file_name: file?.name || null,
    });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Pago registrado', 'success');
    setFile(null);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-head"><h2>Registrar pago</h2><button type="button" className="modal-close" onClick={onClose}>&times;</button></div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="field"><label>Tipo</label>
              <select name="tipo"><option value="Seguro">Seguro</option><option value="Satelital">Satelital</option><option value="Otro">Otro</option></select>
            </div>
          </div>
          <div className="field"><label>Monto</label><input name="monto" type="number" step="0.01" /></div>
          <FileField label="Comprobante (foto o PDF)" folder={`vehiculos/${vehicleId}/pagos`} currentPath={file?.path} currentName={file?.name} onUploaded={setFile} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
