'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { Modal, useToast, DocBadge } from '@/components/ui';
import { Driver, DriverDoc, DRIVER_DOC_FIELDS } from '@/lib/types';

export default function ChoferesPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [docs, setDocs] = useState<DriverDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const [d, dd] = await Promise.all([
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('driver_docs').select('*'),
    ]);
    setDrivers(d.data || []); setDocs(dd.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveDriver(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nombre = String(fd.get('nombre') || '').trim();
    if (!nombre) { showToast('Ingresá el nombre', 'error'); return; }
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('drivers').insert({ owner: user!.id, nombre, dni: String(fd.get('dni') || '').trim() });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Chofer guardado', 'success');
    setOpen(false);
    load();
  }

  return (
    <>
      <div id="topbar">
        <div><h1>Choferes</h1><div className="sub">{drivers.length} chofer{drivers.length === 1 ? '' : 'es'} registrado{drivers.length === 1 ? '' : 's'}</div></div>
        <div className="topbar-actions"><button className="btn btn-primary" onClick={() => setOpen(true)}>+ Agregar chofer</button></div>
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div> :
        drivers.length === 0 ? (
          <div className="card empty">
            <h3>Todavía no cargaste choferes</h3>
            <p>Agregá el primero para llevar el control de su documentación y vencimientos.</p>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Agregar chofer</button>
          </div>
        ) : (
          <div className="grid grid-4">
            {drivers.map(d => (
              <Link key={d.id} href={`/dashboard/choferes/${d.id}`} className="card entity-card">
                <div className="entity-name">{d.nombre}</div>
                <div className="entity-meta">DNI {d.dni || '—'}</div>
                <div className="doc-row">
                  {DRIVER_DOC_FIELDS.map(([key, label]) => {
                    const doc = docs.find(x => x.driver_id === d.id && x.key === key);
                    return <DocBadge key={key} dateStr={doc?.vencimiento} />;
                  })}
                </div>
              </Link>
            ))}
          </div>
        )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={saveDriver}>
          <div className="modal-head"><h2>Agregar chofer</h2><button type="button" className="modal-close" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Nombre y apellido</label><input name="nombre" /></div>
              <div className="field"><label>DNI</label><input name="dni" /></div>
            </div>
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
