'use client';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { fmtDate, fmtMoney } from '@/lib/utils';
import { Modal, useToast, FileField, FileThumb, ScanModal } from '@/components/ui';
import { Invoice, Settings, Cliente } from '@/lib/types';

export default function FacturacionPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ fecha?: string; monto?: number; descripcion?: string } | null>(null);
  const [invFile, setInvFile] = useState<{ path: string; name: string } | null>(null);
  const [afipFile, setAfipFile] = useState<{ path: string; name: string } | null>(null);
  const [iibbFile, setIibbFile] = useState<{ path: string; name: string } | null>(null);
  const showToast = useToast();

  async function load() {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const [inv, s, cli] = await Promise.all([
      supabase.from('invoices').select('*').order('fecha', { ascending: false }),
      supabase.from('settings').select('*').eq('owner', user!.id).maybeSingle(),
      supabase.from('clientes').select('*').order('razon_social', { ascending: true }),
    ]);
    setInvoices(inv.data || []);
    setClientes(cli.data || []);
    const settingsData = s.data || { owner: user!.id, precio_combustible: null, condicion_fiscal: 'RI', alicuota_iva: 21, afip_alta_path: null, afip_alta_name: null, iibb_path: null, iibb_name: null };
    setSettings(settingsData as Settings);
    setAfipFile(settingsData.afip_alta_path ? { path: settingsData.afip_alta_path, name: settingsData.afip_alta_name || '' } : null);
    setIibbFile(settingsData.iibb_path ? { path: settingsData.iibb_path, name: settingsData.iibb_name || '' } : null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const isRI = settings?.condicion_fiscal === 'RI';
  const alicuota = Number(settings?.alicuota_iva) || 21;

  const { byMonth, months, totalFacturado, promedioMensual, ivaPromedioMensual, ivaTotal } = useMemo(() => {
    const byMonth: Record<string, number> = {};
    invoices.forEach(inv => {
      const mk = inv.fecha?.slice(0, 7);
      if (!mk) return;
      byMonth[mk] = (byMonth[mk] || 0) + (Number(inv.monto) || 0);
    });
    const months = Object.keys(byMonth).sort();
    const totalFacturado = invoices.reduce((s, i) => s + (Number(i.monto) || 0), 0);
    const promedioMensual = months.length ? months.reduce((s, m) => s + byMonth[m], 0) / months.length : 0;
    const ivaPromedioMensual = isRI ? promedioMensual * (alicuota / 100) : 0;
    const ivaTotal = isRI ? totalFacturado * (alicuota / 100) : 0;
    return { byMonth, months, totalFacturado, promedioMensual, ivaPromedioMensual, ivaTotal };
  }, [invoices, isRI, alicuota]);

  async function saveFiscal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('settings').upsert({
      owner: user!.id,
      condicion_fiscal: fd.get('condicion'),
      alicuota_iva: Number(fd.get('alicuota')) || 21,
    });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Datos fiscales guardados', 'success');
    load();
  }

  async function saveAfip(file: { path: string; name: string }) {
    setAfipFile(file);
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('settings').upsert({ owner: user!.id, afip_alta_path: file.path, afip_alta_name: file.name });
    if (error) { showToast('No se pudo guardar.', 'error'); return; }
    showToast('Alta de AFIP guardada', 'success');
  }
  async function saveIibb(file: { path: string; name: string }) {
    setIibbFile(file);
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('settings').upsert({ owner: user!.id, iibb_path: file.path, iibb_name: file.name });
    if (error) { showToast('No se pudo guardar.', 'error'); return; }
    showToast('Constancia de IIBB guardada', 'success');
  }

  async function saveInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const monto = Number(fd.get('monto')) || null;
    if (!monto) { showToast('Ingresá el monto de la factura', 'error'); return; }
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('invoices').insert({
      owner: user!.id, fecha: fd.get('fecha'), monto,
      descripcion: String(fd.get('desc') || '').trim(),
      cliente_id: fd.get('cliente_id') || null,
      file_path: invFile?.path || null, file_name: invFile?.name || null,
    });
    if (error) { showToast('No se pudo guardar. Probá de nuevo.', 'error'); return; }
    showToast('Factura guardada', 'success');
    setFormOpen(false); setInvFile(null); setPrefill(null);
    load();
  }

  function handleExtracted(extracted: any) {
    setPrefill({
      fecha: extracted.fecha || new Date().toISOString().slice(0, 10),
      monto: extracted.monto || undefined,
      descripcion: extracted.descripcion || '',
    });
    setScanOpen(false);
    setFormOpen(true);
    showToast('Datos leídos. Revisalos antes de guardar.', 'success');
  }

  async function deleteInvoice(id: string) {
    const supabase = supabaseBrowser();
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar', 'error'); return; }
    showToast('Factura eliminada', 'success');
    load();
  }

  function exportExcel() {
    if (invoices.length === 0) { showToast('No hay facturas para exportar', 'error'); return; }
    const alicuotaPct = Number(settings?.alicuota_iva) || 21;
    const esRI = settings?.condicion_fiscal === 'RI';

    const detalle = [...invoices]
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
      .map(inv => ({
        Fecha: fmtDate(inv.fecha),
        Descripción: inv.descripcion || '',
        Cliente: clientes.find(c => c.id === inv.cliente_id)?.razon_social || '',
        Monto: Number(inv.monto) || 0,
        'IVA estimado': esRI ? Math.round((Number(inv.monto) || 0) * (alicuotaPct / 100) * 100) / 100 : '',
        'Tiene comprobante': inv.file_path ? 'Sí' : 'No',
      }));
    const wsDetalle = XLSX.utils.json_to_sheet(detalle);
    wsDetalle['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

    const resumen = months.map(m => ({
      Mes: m,
      Facturado: byMonth[m],
      'IVA estimado': esRI ? Math.round(byMonth[m] * (alicuotaPct / 100) * 100) / 100 : '',
    }));
    resumen.push({ Mes: 'TOTAL', Facturado: totalFacturado, 'IVA estimado': esRI ? Math.round(ivaTotal * 100) / 100 : '' } as any);
    const wsResumen = XLSX.utils.json_to_sheet(resumen);
    wsResumen['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Facturas');
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen mensual');
    XLSX.writeFile(wb, `facturacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (loading || !settings) return <div className="empty"><div className="spinner" style={{ margin: '0 auto 10px' }} />Cargando...</div>;

  return (
    <>
      <div id="topbar">
        <div><h1>Facturación</h1><div className="sub">Facturas, IVA estimado y datos fiscales</div></div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={() => setScanOpen(true)}>Escanear factura</button>
          <button className="btn btn-secondary" onClick={exportExcel}>Descargar Excel</button>
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>+ Cargar factura</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="card stat-card"><div className="stat-label">Total facturado</div><div className="stat-value">{fmtMoney(totalFacturado)}</div></div>
        <div className="card stat-card"><div className="stat-label">{isRI ? `IVA estimado (${alicuota}%)` : 'IVA (Monotributo: no aplica)'}</div><div className="stat-value">{isRI ? fmtMoney(ivaTotal) : '—'}</div></div>
        <div className="card stat-card"><div className="stat-label">Promedio facturado / mes</div><div className="stat-value">{fmtMoney(promedioMensual)}</div></div>
        <div className="card stat-card"><div className="stat-label">Promedio IVA a pagar / mes</div><div className="stat-value">{isRI ? fmtMoney(ivaPromedioMensual) : '—'}</div></div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', marginBottom: 20 }}>
        <div className="card fiscal-card">
          <h3 style={{ marginBottom: 12, fontSize: 18 }}>Datos fiscales</h3>
          <form onSubmit={saveFiscal}>
            <div className="field"><label>Condición frente al IVA</label>
              <select name="condicion" defaultValue={settings.condicion_fiscal}>
                <option value="RI">Responsable Inscripto</option>
                <option value="MONO">Monotributo</option>
              </select>
            </div>
            <div className="field"><label>Alícuota de IVA (%)</label><input name="alicuota" type="number" step="0.01" defaultValue={alicuota} /></div>
            <button className="btn btn-secondary" type="submit">Guardar datos fiscales</button>
          </form>
          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '18px 0' }} />
          <FileField label="Alta de AFIP (Monotributo / RI)" folder="fiscal" currentPath={afipFile?.path} currentName={afipFile?.name} onUploaded={saveAfip} />
          <div style={{ marginTop: 14 }}>
            <FileField label="Constancia de IIBB" folder="fiscal" currentPath={iibbFile?.path} currentName={iibbFile?.name} onUploaded={saveIibb} />
          </div>
        </div>
        <div className="card table-wrap">
          <h3 style={{ margin: '16px 18px 4px', fontSize: 18 }}>Facturación por mes</h3>
          {months.length === 0 ? <div className="empty"><h3>Sin facturas cargadas</h3><p>Cargá tu primera factura para empezar a ver los totales.</p></div> : (
            <table>
              <thead><tr><th>Mes</th><th>Facturado</th><th>{isRI ? 'IVA estimado' : ''}</th></tr></thead>
              <tbody>{months.slice().reverse().map(m => (
                <tr key={m}><td>{m}</td><td style={{ fontWeight: 600 }}>{fmtMoney(byMonth[m])}</td><td>{isRI ? fmtMoney(byMonth[m] * (alicuota / 100)) : '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section-head"><h3 style={{ fontSize: 18 }}>Facturas cargadas</h3></div>
      <div className="card table-wrap">
        {invoices.length === 0 ? <div className="empty"><h3>Sin facturas</h3><p>Cargá una factura para empezar a promediar tu facturación e IVA.</p></div> : (
          <table>
            <thead><tr><th>Fecha</th><th>Descripción</th><th>Cliente</th><th>Monto</th><th>Comprobante</th><th></th></tr></thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{fmtDate(inv.fecha)}</td><td>{inv.descripcion || '—'}</td>
                  <td>{clientes.find(c => c.id === inv.cliente_id)?.razon_social || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMoney(inv.monto)}</td>
                  <td><FileThumb path={inv.file_path} name={inv.file_name} /></td>
                  <td><button className="btn btn-ghost" onClick={() => deleteInvoice(inv.id)}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setInvFile(null); setPrefill(null); }}>
        <form onSubmit={saveInvoice} key={prefill ? 'prefilled' : 'blank'}>
          <div className="modal-head"><h2>Cargar factura</h2><button type="button" className="modal-close" onClick={() => setFormOpen(false)}>&times;</button></div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field"><label>Fecha</label><input name="fecha" type="date" defaultValue={prefill?.fecha || new Date().toISOString().slice(0, 10)} /></div>
              <div className="field"><label>Monto</label><input name="monto" type="number" step="0.01" defaultValue={prefill?.monto || ''} /></div>
            </div>
            <div className="field"><label>Descripción (opcional)</label><input name="desc" placeholder="Ej: Factura A N° 0001-00001234" defaultValue={prefill?.descripcion || ''} /></div>
            <div className="field"><label>Cliente (opcional)</label>
              <select name="cliente_id" defaultValue="">
                <option value="">Sin asignar</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
              </select>
            </div>
            <FileField label="Foto o PDF de la factura" folder="facturas" currentPath={invFile?.path} currentName={invFile?.name} onUploaded={setInvFile} />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      <ScanModal open={scanOpen} kind="factura" onClose={() => setScanOpen(false)} onExtracted={handleExtracted} />
    </>
  );
}
