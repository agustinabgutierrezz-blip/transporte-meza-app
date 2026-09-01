# Transporte Meza · Control de Flota

## 📌 Si ya tenías la app instalada y estás actualizando

1. **Base de datos**: andá a Supabase → SQL Editor → pegá **todo** el archivo `supabase/schema.sql` de nuevo y dale Run. Es seguro, no borra nada — solo agrega la tabla nueva de Clientes.
2. **Código**: en GitHub, entrá a tu repositorio → botón **"Add file" → "Upload files"** → arrastrá **todos** los archivos y carpetas de esta carpeta (los de adentro, no la carpeta zip). GitHub te va a preguntar si querés reemplazar los archivos que ya existen — decile que sí. Al final, "Commit changes".
3. Vercel va a detectar el cambio solo y publicar la versión nueva en 1-2 minutos. No hace falta tocar nada ahí.

---

App propia (no depende del chat de Claude) para gestionar vehículos, choferes, viajes, combustible y facturación. Login con usuario y contraseña. Todo gratis: **Supabase** (base de datos + login + archivos) y **Vercel** (hosting).

No hace falta saber programar para desplegarla: seguí los pasos en orden. Vas a tardar unos 20-30 minutos la primera vez.

---

## 1. Crear el proyecto en Supabase (base de datos, login y archivos)

1. Andá a **https://supabase.com** → creá una cuenta gratis → **New Project**.
2. Elegí un nombre (ej. `transporte-meza`), una contraseña de base de datos (guardala, no la vas a necesitar de nuevo salvo emergencias) y la región más cercana (São Paulo).
3. Esperá 1-2 minutos a que el proyecto termine de crearse.

### 1.1 Crear las tablas
1. En el menú izquierdo, andá a **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/schema.sql` de esta carpeta, copiá **todo** su contenido y pegalo ahí.
3. Apretá **Run**. Deberías ver "Success. No rows returned".

### 1.2 Crear el bucket de archivos (fotos/PDF)
1. Andá a **Storage** (menú izquierdo) → **New bucket**.
2. Nombre: `docs` (exactamente así, en minúsculas).
3. Dejalo como **Private** (NO marques "Public bucket").
4. Creá el bucket. (Las políticas de acceso ya quedaron configuradas por el script SQL del paso anterior.)

### 1.3 Crear tu usuario administrador (el único que va a poder entrar)
1. Andá a **Authentication** → **Users** → **Add user** → **Create new user**.
2. Cargá tu email y una contraseña. Marcá **Auto Confirm User** (así no hace falta verificar el email).
3. Guardá ese email y esa contraseña — son tu usuario y contraseña de la app.
4. Importante: andá a **Authentication** → **Providers** → **Email** y **desactivá "Allow new users to sign up"**. Así nadie más se puede crear una cuenta.

### 1.4 Copiar las claves del proyecto
1. Andá a **Project Settings** (ícono de engranaje) → **API**.
2. Copiá:
   - **Project URL**
   - **anon public key**

Las vas a usar en el paso 3.

---

## 2. (Opcional) Conseguir una clave de Anthropic para el escaneo automático

El botón "Escanear ticket / hoja de ruta" usa IA para leer las fotos. Es una función opcional — el resto de la app funciona perfecto sin esto, solo se carga todo a mano.

1. Andá a **https://console.anthropic.com** → creá una cuenta → **API Keys** → **Create Key**.
2. Cargá crédito (tiene costo por uso, es muy bajo — centavos por escaneo).
3. Copiá la clave (empieza con `sk-ant-...`).

Si no querés esto, dejá `ANTHROPIC_API_KEY` vacío y seguís de largo.

---

## 3. Desplegar en Vercel (gratis)

1. Subí esta carpeta a un repositorio de GitHub (podés arrastrar los archivos en github.com → New repository → "uploading an existing file", o pedirle ayuda a alguien con Git).
2. Andá a **https://vercel.com** → creá una cuenta gratis (podés entrar con tu cuenta de GitHub) → **Add New Project** → elegí el repositorio que subiste.
3. En **Environment Variables**, agregá:
   | Nombre | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | el Project URL del paso 1.4 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | el anon public key del paso 1.4 |
   | `ANTHROPIC_API_KEY` | (opcional) la clave del paso 2 |
4. Apretá **Deploy**. Esperá 1-2 minutos.
5. Vercel te da una URL tipo `transporte-meza.vercel.app` — esa es tu app, ya en internet, gratis.

Para futuros cambios: cada vez que actualices el código en GitHub, Vercel lo vuelve a publicar solo.

---

## 4. Usar la app

1. Entrá a tu URL de Vercel.
2. Iniciá sesión con el email y contraseña que creaste en el paso 1.3.
3. Listo — Flota, Choferes, Viajes, Combustible y Facturación, todo con guardado real en tu base de datos propia.

---

## Notas

- **Multiusuario**: hoy está pensada para un solo administrador. Si más adelante querés que cada chofer suba su propia documentación con su propio login, avisame — es una extensión del mismo proyecto (tablas y políticas ya están preparadas por `owner`, solo faltaría un flujo de registro para choferes).
- **Costo real**: con uso normal (una empresa chica/mediana), tanto Supabase como Vercel se mantienen dentro del plan gratuito. Si en algún momento superás los límites gratuitos (mucho almacenamiento de fotos, mucho tráfico), Supabase avisa antes de cobrar.
- **Backups**: Supabase hace backups automáticos incluso en el plan gratuito (retención más corta que los planes pagos, pero existe).
