'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtKm } from '@/lib/utils';
import { Modal, useToast } from '@/components/ui';
import { Vehicle } from '@/lib/types';

export default function FlotaPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from('vehicles').select('*').order('created_at', { ascending: false });
    setVehicles(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveVehicle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const patente = String(fd.get('patente') || '').trim().toUpperCase();
    if (!patente) { showToast('Ingresá la patente', 'error'); return; }
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('vehicles').insert({
      owner: user!.id,
      patente,
      marca: String(fd.get('marca') || '').trim(),
      modelo: String(fd.get('modelo') || '').trim(),
      anio: Number(fd.get('anio')) || null,
      km: Number(fd.get('km')) || 0,
    });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Vehículo guardado', 'success');
    setOpen(false);
    load();
  }

  return (
    <>
      <div id="topbar">
        <div><h1>Flota</h1><div className="sub">{vehicles.length} vehículo{vehicles.length === 1 ? '' : 's'} registrado{vehicles.length === 1 ? '' : 's'}</div></div>
        <div className="topbar-actions"><button className="btn btn-primary" onClick={() => setOpen(true)}>+ Agregar vehículo</button></div>
      </div>

      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div> :
        vehicles.length === 0 ? (
          <div className="card empty">
            <h3>Todavía no cargaste vehículos</h3>
            <p>Agregá el primero para empezar a llevar el control de patente, service y cubiertas.</p>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Agregar vehículo</button>
          </div>
        ) : (
          <div className="grid grid-4">
            {vehicles.map(v => (
              <Link key={v.id} href={`/dashboard/flota/${v.id}`} className="card entity-card">
                <div className="entity-top">
                  <span className="plate"><span className="ar">RA</span><span className="num">{v.patente}</span></span>
                </div>
                <div>
                  <div className="entity-name">{v.marca} {v.modelo}</div>
                  <div className="entity-meta">{v.anio ? `Año ${v.anio} · ` : ''}{fmtKm(v.km)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={saveVehicle}>
          <div className="modal-head"><h2>Agregar vehículo</h2><button type="button" className="modal-close" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field"><label>Patente</label><input name="patente" placeholder="AB123CD" style={{ textTransform: 'uppercase' }} /></div>
            <div className="field-row">
              <div className="field"><label>Marca</label><input name="marca" placeholder="Mercedes-Benz" /></div>
              <div className="field"><label>Modelo</label><input name="modelo" placeholder="Accelo 815" /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Año</label><input name="anio" type="number" placeholder="2019" /></div>
              <div className="field"><label>Kilometraje actual</label><input name="km" type="number" placeholder="152000" /></div>
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
