export type Vehicle = {
  id: string; patente: string; marca: string | null; modelo: string | null;
  anio: number | null; km: number | null; tipo_unidad: string | null;
};
export type Driver = { id: string; nombre: string; dni: string | null };
export type DriverDoc = { id: string; driver_id: string; key: string; vencimiento: string | null; file_path: string | null; file_name: string | null };
export type VehicleDoc = { id: string; vehicle_id: string; key: string; vencimiento: string | null; file_path: string | null; file_name: string | null };
export type VehiclePayment = { id: string; vehicle_id: string; fecha: string | null; tipo: string | null; monto: number | null; file_path: string | null; file_name: string | null };
export type Cubierta = { id: string; vehicle_id: string; fecha: string | null; km: number | null; posicion: string | null; notas: string | null };
export type Mantenimiento = { id: string; vehicle_id: string; fecha: string | null; km: number | null; tipo: string | null; costo: number | null; taller: string | null; notas: string | null };
export type Trip = { id: string; fecha: string | null; vehicle_id: string | null; driver_id: string | null; origen: string | null; destino: string | null; km: number | null; notas: string | null; costo_estimado: number | null; zona: string | null; tiene_peon: boolean | null; costo_peon: number | null; categoria: string | null };
export type Fuel = { id: string; fecha: string | null; vehicle_id: string | null; estacion: string | null; litros: number | null; precio_litro: number | null; total: number | null };
export type Invoice = { id: string; fecha: string | null; monto: number | null; descripcion: string | null; file_path: string | null; file_name: string | null; cliente_id: string | null };
export type Cliente = { id: string; razon_social: string; cuit: string | null };
export type Tarifa = { id: string; tipo_unidad: string; km_desde: number; km_hasta: number | null; precio: number; zona: string | null };
function normTipo(s: string | null | undefined) { return (s || '').trim().toLowerCase(); }
export function findTarifa(tarifas: Tarifa[], tipoUnidad: string | null | undefined, km: number | null | undefined): Tarifa | null {
  if (!tipoUnidad || km === null || km === undefined) return null;
  const candidatas = tarifas.filter(t => normTipo(t.tipo_unidad) === normTipo(tipoUnidad) && km >= t.km_desde && (t.km_hasta === null || km <= t.km_hasta));
  return candidatas[0] || null;
}
export function findTarifaByZona(tarifas: Tarifa[], tipoUnidad: string | null | undefined, zona: string | null | undefined): Tarifa | null {
  if (!tipoUnidad || !zona) return null;
  return tarifas.find(t => normTipo(t.tipo_unidad) === normTipo(tipoUnidad) && normTipo(t.zona) === normTipo(zona)) || null;
}
export type Settings = {
  owner: string; precio_combustible: number | null; condicion_fiscal: string;
  alicuota_iva: number; afip_alta_path: string | null; afip_alta_name: string | null;
  iibb_path: string | null; iibb_name: string | null;
};

export const DRIVER_DOC_FIELDS: [string, string][] = [
  ['licencia', 'Registro / Carnet de conducir'],
  ['cedula', 'Cédula del vehículo'],
  ['manipulacion', 'Carnet de manipulación'],
  ['seguroVida', 'Seguro de vida'],
  ['art', 'ART'],
  ['cargasPeligrosas', 'Cargas peligrosas'],
];
export const VEHICLE_DOC_FIELDS: [string, string, boolean][] = [
  ['seguro', 'Seguro del vehículo', true],
  ['titulo', 'Título del vehículo', false],
  ['vtv', 'VTV (Verificación Técnica)', true],
];
export const CATEGORIAS_VIAJE = ['Alcance', 'Mercado con Adicional - ABASTO', 'TEMPERATURA CONTROLADA'];
