import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'El escaneo automático no está configurado. Agregá ANTHROPIC_API_KEY en las variables de entorno.' }, { status: 400 });
  }

  const { base64, mediaType, kind } = await req.json();
  if (!base64 || !kind) {
    return NextResponse.json({ error: 'Faltan datos de la imagen.' }, { status: 400 });
  }

  const prompt = kind === 'viaje'
    ? `Sos un asistente que extrae datos de un documento de viaje / hoja de ruta de transporte de carga argentina (por ejemplo remitos tipo TRADELOG, H.ESSERS u otros transportistas) a partir de una imagen. Estos documentos suelen incluir un número de hoja de ruta (HR), datos del chofer, patente del vehículo, cliente, origen y destino, kilos y bultos. Devolvé SOLO un objeto JSON válido, sin texto adicional, sin bloques de código ni markdown, con exactamente estos campos:
- fecha (formato YYYY-MM-DD, tomá la fecha de generación o despacho del documento; si no se identifica, null)
- patente (patente del vehículo, string o null)
- origen (nombre o dirección de origen del viaje, string o null)
- destino (nombre o dirección de destino del viaje, string o null)
- km (kilómetros recorridos si figuran explícitamente, number o null; no lo confundas con kilos de carga)
- chofer (nombre completo del chofer, string o null)
- observaciones (número de hoja de ruta, cliente, kilos de carga, cantidad de bultos, string o null)
Si no podés determinar un campo con certeza, poné null en ese campo. No inventes datos.`
    : kind === 'factura'
    ? `Sos un asistente que extrae datos de una factura argentina (emitida por un monotributista o responsable inscripto, tipo A/B/C, con CAE de ARCA/AFIP) a partir de una imagen o PDF. Devolvé SOLO un objeto JSON válido, sin texto adicional, sin bloques de código ni markdown, con exactamente estos campos:
- fecha (Fecha de Emisión de la factura, formato YYYY-MM-DD, si se puede identificar, sino null)
- monto (Importe Total de la factura, number o null; usá el monto final con IVA incluido)
- cliente (el nombre/razón social del cliente al que se le factura — el campo "Apellido y Nombre / Razón Social" del receptor, NO el emisor de la factura. string o null)
- cuit_cliente (el CUIT del cliente/receptor si figura, formato con guiones tipo "30-69617300-8", string o null)
- descripcion (armá un texto breve con: tipo y letra de comprobante, punto de venta y número (ej "Factura A 0006-00000014"), y el concepto facturado si figura. NO repitas el nombre del cliente acá, ya va en el campo "cliente". string o null)
Si no podés determinar un campo con certeza, poné null en ese campo. No inventes datos.`
    : `Sos un asistente que extrae datos de un ticket, remito o comprobante de carga de combustible/gasoil argentino (de una estación de servicio o distribuidora) a partir de una imagen. Devolvé SOLO un objeto JSON válido, sin texto adicional, sin bloques de código ni markdown, con exactamente estos campos:
- fecha (formato YYYY-MM-DD, si se puede identificar, sino null)
- estacion (nombre de la estación o distribuidora, string o null)
- patente (patente del vehículo o dominio, string o null)
- litros (cantidad de litros cargados, number o null)
- precioLitro (precio unitario por litro, number o null)
- total (monto total; si no figura pero hay litros y precio, calculalo, number o null)
Si no podés determinar un campo con certeza, poné null en ese campo. No inventes datos.`;

  const contentBlock = (mediaType || '').includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const data = await response.json();
    const text = (data.content || []).map((b: any) => b.text || '').join('').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);
    return NextResponse.json({ extracted });
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo leer la imagen automáticamente.' }, { status: 500 });
  }
}
