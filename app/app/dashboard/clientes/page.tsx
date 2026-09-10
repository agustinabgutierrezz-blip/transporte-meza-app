'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtMoney } from '@/lib/utils';
import { Modal, useToast } from '@/components/ui';
import { Cliente, Invoice } from '@/lib/types';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const [c, inv] = await Promise.all([
      supabase.from('clientes').select('*').order('razon_social', { ascending: true }),
      supabase.from('invoices').select('*'),
    ]);
    setClientes(c.data || []); setInvoices(inv.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const totalPorCliente = useMemo(() => {
    const map: Record<string, number> = {};
    invoices.forEach(inv => {
      if (!inv.cliente_id) return;
      map[inv.cliente_id] = (map[inv.cliente_id] || 0) + (Number(inv.monto) || 0);
    });
    return map;
  }, [invoices]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const razon_social = String(fd.get('razon_social') || '').trim();
    if (!razon_social) { showToast('Ingresá la razón social', 'error'); return; }
    const supabase = supabaseBrowser();
    let error;
    if (editing) {
      ({ error } = await supabase.from('clientes').update({ razon_social, cuit: fd.get('cuit') }).eq('id', editing.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from('clientes').insert({ owner: user!.id, razon_social, cuit: fd.get('cuit') }));
    }
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Cliente guardado', 'success');
    setOpen(false); setEditing(null);
    load();
  }

  async function deleteCliente(id: string) {
    if (!confirm('¿Eliminar este cliente? Las facturas ya cargadas no se borran, solo quedan sin cliente asignado.')) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar', 'error'); return; }
    showToast('Cliente eliminado', 'success');
    load();
  }

  return (
    <>
      <div id="topbar">
        <div><h1>Clientes</h1><div className="sub">{clientes.length} cliente{clientes.length === 1 ? '' : 's'} registrado{clientes.length === 1 ? '' : 's'}</div></div>
        <div className="topbar-actions"><button className="btn btn-primary" onClick={() => { setEditing(null); setOpen(true); }}>+ Agregar cliente</button></div>
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div> :
        clientes.length === 0 ? (
          <div className="card empty">
            <h3>Todavía no cargaste clientes</h3>
            <p>Agregalos para poder vincular tus facturas y ver cuánto le facturaste a cada uno.</p>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Agregar cliente</button>
          </div>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Razón Social</th><th>CUIT</th><th>Total facturado</th><th></th></tr></thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.razon_social}</td>
                    <td>{c.cuit || '—'}</td>
                    <td>{fmtMoney(totalPorCliente[c.id] || 0)}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => { setEditing(c); setOpen(true); }}>Editar</button>
                      <button className="btn btn-ghost" onClick={() => deleteCliente(c.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }}>
        <form onSubmit={save} key={editing?.id || 'new'}>
          <div className="modal-head"><h2>{editing ? 'Editar cliente' : 'Agregar cliente'}</h2><button type="button" className="modal-close" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field"><label>Razón social</label><input name="razon_social" defaultValue={editing?.razon_social || ''} placeholder="Ej: TRADELOG S.A.U." /></div>
            <div className="field"><label>CUIT</label><input name="cuit" defaultValue={editing?.cuit || ''} placeholder="30-69617300-8" /></div>
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
