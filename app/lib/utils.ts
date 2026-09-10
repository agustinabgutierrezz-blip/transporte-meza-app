export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function fmtDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtMoney(n?: number | null) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}
export function fmtKm(n?: number | null) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('es-AR') + ' km';
}
export function daysUntil(dateStr?: string | null) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
export function docStatus(dateStr?: string | null): 'none' | 'ok' | 'warn' | 'danger' {
  if (!dateStr) return 'none';
  const days = daysUntil(dateStr)!;
  if (days < 0) return 'danger';
  if (days <= 30) return 'warn';
  return 'ok';
}
export function statusLabel(status: string, days: number | null) {
  if (status === 'none') return 'Sin cargar';
  if (days === null) return '';
  if (status === 'danger') return days === 0 ? 'Vence hoy' : `Vencido hace ${Math.abs(days)}d`;
  return `Vence en ${days}d`;
}
