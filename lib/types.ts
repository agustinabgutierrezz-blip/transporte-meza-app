export type Vehicle = {
  id: string; patente: string; marca: string | null; modelo: string | null;
  anio: number | null; km: number | null;
};
export type Driver = { id: string; nombre: string; dni: string | null };
export type DriverDoc = { id: string; driver_id: string; key: string; vencimiento: string | null; file_path: string | null; file_name: string | null };
export type VehicleDoc = { id: string; vehicle_id: string; key: string; vencimiento: string | null; file_path: string | null; file_name: string | null };
export type VehiclePayment = { id: string; vehicle_id: string; fecha: string | null; tipo: string | null; monto: number | null; file_path: string | null; file_name: string | null };
export type Cubierta = { id: string; vehicle_id: string; fecha: string | null; km: number | null; posicion: string | null; notas: string | null };
export type Mantenimiento = { id: string; vehicle_id: string; fecha: string | null; km: number | null; tipo: string | null; costo: number | null; taller: string | null; notas: string | null };
export type Trip = { id: string; fecha: string | null; vehicle_id: string | null; driver_id: string | null; origen: string | null; destino: string | null; km: number | null; notas: string | null };
export type Fuel = { id: string; fecha: string | null; vehicle_id: string | null; estacion: string | null; litros: number | null; precio_litro: number | null; total: number | null };
export type Invoice = { id: string; fecha: string | null; monto: number | null; descripcion: string | null; file_path: string | null; file_name: string | null };
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
];
