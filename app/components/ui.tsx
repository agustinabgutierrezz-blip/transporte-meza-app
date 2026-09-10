'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { docStatus, statusLabel } from '@/lib/utils';

/* ---------- Toasts ---------- */
type Toast = { id: number; msg: string; type: 'success' | 'error' | '' };
const ToastCtx = createContext<(msg: string, type?: Toast['type']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const showToast = useCallback((msg: string, type: Toast['type'] = '') => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3400);
  }, []);
  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div id="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  return useContext(ToastCtx);
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!open) return null;
  return (
    <div id="modal-root" className="open">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-box">{children}</div>
    </div>
  );
}

/* ---------- Badge de vencimiento ---------- */
export function DocBadge({ dateStr }: { dateStr?: string | null }) {
  const st = docStatus(dateStr);
  const days = dateStr ? Math.round((new Date(dateStr + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;
  return (
    <span className={`badge ${st}`}>
      <span className="dot" />
      {st === 'none' ? 'Sin cargar' : statusLabel(st, days)}
    </span>
  );
}

/* ---------- Subida de archivos a Supabase Storage (bucket privado "docs") ---------- */
export type StoredFile = { path: string; name: string } | null;

export function useFileUpload(folder: string) {
  const [uploading, setUploading] = useState(false);
  const showToast = useToast();

  async function upload(file: File): Promise<StoredFile> {
    setUploading(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('docs').upload(path, file, { upsert: true });
      if (error) throw error;
      return { path, name: file.name };
    } catch (e) {
      showToast('No se pudo subir el archivo. Probá de nuevo.', 'error');
      return null;
    } finally {
      setUploading(false);
    }
  }
  return { upload, uploading };
}

export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    const supabase = supabaseBrowser();
    supabase.storage.from('docs').createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl || null);
    });
    return () => { active = false; };
  }, [path]);
  return url;
}

export function FileField({
  label, folder, currentPath, currentName, onUploaded,
}: {
  label: string; folder: string; currentPath?: string | null; currentName?: string | null;
  onUploaded: (file: StoredFile) => void;
}) {
  const { upload, uploading } = useFileUpload(folder);
  const signedUrl = useSignedUrl(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="field">
      <label>{label}</label>
      <div className="file-upload">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const result = await upload(file);
            if (result) onUploaded(result);
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Subiendo...' : currentPath ? 'Reemplazar archivo' : 'Subir foto o PDF'}
        </button>
        <span className="field-hint">{currentName ? `Archivo: ${currentName}` : 'Sin archivo'}</span>
        {signedUrl && (
          currentName?.toLowerCase().endsWith('.pdf')
            ? <a href={signedUrl} target="_blank" className="file-thumb-link">Ver PDF</a>
            : <img src={signedUrl} className="file-thumb" alt="" />
        )}
      </div>
    </div>
  );
}

export function FileThumb({ path, name }: { path?: string | null; name?: string | null }) {
  const signedUrl = useSignedUrl(path);
  if (!path) return <span className="entity-meta">Sin archivo</span>;
  if (!signedUrl) return <span className="entity-meta">Cargando...</span>;
  if (name?.toLowerCase().endsWith('.pdf')) {
    return <a href={signedUrl} target="_blank" className="file-thumb-link">Ver PDF</a>;
  }
  return <img src={signedUrl} className="doc-table-row-thumb" alt="" />;
}

/* ---------- Escaneo con IA ---------- */
export function ScanModal({
  open, kind, onClose, onExtracted,
}: { open: boolean; kind: 'viaje' | 'combustible' | 'factura'; onClose: () => void; onExtracted: (data: any) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const pdf = (file.type || '').includes('pdf');
    setIsPdf(pdf);
    setFileName(file.name);
    setPreview(dataUrl);
    setStatus('loading');
    const base64 = dataUrl.split(',')[1];
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: file.type || 'image/jpeg', kind }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'error');
      onExtracted(data.extracted);
    } catch {
      setStatus('error');
    }
  }

  if (!open) return null;
  const label = kind === 'viaje' ? 'de la hoja de ruta' : kind === 'factura' ? 'o PDF de la factura' : 'del ticket de combustible';
  const title = kind === 'viaje' ? 'Escanear hoja de ruta' : kind === 'factura' ? 'Escanear factura' : 'Escanear ticket de combustible';
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-head"><h2>{title}</h2><button type="button" className="modal-close" onClick={onClose}>&times;</button></div>
      <div className="modal-body">
        {!preview && (
          <div className="scan-drop">
            <p style={{ marginBottom: 10 }}>Subí una foto {label}.</p>
            <input ref={inputRef} type="file" accept="image/*,application/pdf" capture={kind === 'factura' ? undefined : 'environment'}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}
        {preview && (isPdf
          ? <div className="scan-drop" style={{ textAlign: 'left' }}>Archivo: {fileName}</div>
          : <img src={preview} className="scan-preview" alt="" />)}
        {status === 'loading' && <div className="scan-status"><div className="spinner" /> Leyendo {isPdf ? 'el PDF' : 'la imagen'}...</div>}
        {status === 'error' && (
          <>
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>No se pudo leer {isPdf ? 'el PDF' : 'la imagen'} automáticamente. Podés cargar los datos a mano.</p>
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={onClose}>Cargar a mano</button>
          </>
        )}
      </div>
    </Modal>
  );
}
