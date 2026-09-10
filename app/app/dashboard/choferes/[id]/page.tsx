'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate } from '@/lib/utils';
import { Modal, useToast, FileField, FileThumb, DocBadge } from '@/components/ui';
import { Driver, DriverDoc, DRIVER_DOC_FIELDS } from '@/lib/types';

export default function DriverDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const showToast = useToast();
  const [d, setD] = useState<Driver | null>(null);
  const [docs, setDocs] = useState<DriverDoc[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [docModal, setDocModal] = useState<{ key: string; label: string } | null>(null);

  async function loadAll() {
    const supabase = supabaseBrowser();
    const [dd, docs2] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', id).single(),
      supabase.from('driver_docs').select('*').eq('driver_id', id),
    ]);
    setD(dd.data); setDocs(docs2.data || []);
  }
  useEffect(() => { loadAll(); }, [id]);

  if (!d) return <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div>;

  async function saveDatos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('drivers').update({
      nombre: String(fd.get('nombre') || '').trim(), dni: String(fd.get('dni') || '').trim(),
    }).eq('id', id);
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Chofer guardado', 'success');
    setEditOpen(false); loadAll();
  }

  async function deleteDriver() {
    if (!confirm('¿Eliminar este chofer y su documentación?')) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar. Probá de nuevo.', 'error'); return; }
    router.push('/dashboard/choferes');
  }

  return (
    <>
      <div id="topbar">
        <div><h1>{d.nombre}</h1><div className="sub">DNI {d.dni || '—'}</div></div>
        <div className="topbar-actions"><button className="btn btn-secondary" onClick={() => setEditOpen(true)}>Editar datos</button></div>
      </div>
      <button className="back-link" onClick={() => router.push('/dashboard/choferes')}>← Volver a Choferes</button>

      <div className="card">
        <table>
          <thead><tr><th>Documento</th><th>Foto</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {DRIVER_DOC_FIELDS.map(([key, label]) => {
              const doc = docs.find(x => x.key === key);
              return (
                <tr key={key}>
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  <td><FileThumb path={doc?.file_path} name={doc?.file_name} /></td>
                  <td>{fmtDate(doc?.vencimiento)}</td>
                  <td><DocBadge dateStr={doc?.vencimiento} /></td>
                  <td><button className="btn btn-ghost" onClick={() => setDocModal({ key, label })}>Editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <form onSubmit={saveDatos}>
          <div className="modal-head"><h2>Editar chofer</h2><button type="button" className="modal-close" onClick={() => setEditOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Nombre y apellido</label><input name="nombre" defaultValue={d.nombre} /></div>
              <div className="field"><label>DNI</label><input name="dni" defaultValue={d.dni || ''} /></div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-danger-outline" onClick={deleteDriver}>Eliminar</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      {docModal && (
        <DriverDocModal
          driverId={id} docKey={docModal.key} label={docModal.label}
          existing={docs.find(x => x.key === docModal.key)}
          onClose={() => setDocModal(null)}
          onSaved={() => { setDocModal(null); loadAll(); }}
        />
      )}
    </>
  );
}

function DriverDocModal({ driverId, docKey, label, existing, onClose, onSaved }: {
  driverId: string; docKey: string; label: string; existing?: DriverDoc; onClose: () => void; onSaved: () => void;
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
    const { error } = await supabase.from('driver_docs').upsert({
      owner: user!.id, driver_id: driverId, key: docKey,
      vencimiento: fd.get('venc') || null,
      file_path: file?.path || null, file_name: file?.name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id,key' });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Documento actualizado', 'success');
    onSaved();
  }

  return (
    <Modal open onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-head"><h2>{label}</h2><button type="button" className="modal-close" onClick={onClose}>&times;</button></div>
        <div className="modal-body">
          <div className="field"><label>Fecha de vencimiento (opcional)</label><input name="venc" type="date" defaultValue={existing?.vencimiento || ''} /></div>
          <FileField label="Foto o PDF del documento" folder={`choferes/${driverId}`} currentPath={file?.path} currentName={file?.name} onUploaded={setFile} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
