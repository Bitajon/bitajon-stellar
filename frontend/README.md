# BITAJÓN · Frontend

Interfaz web de BITAJÓN (Thriving Stellar): campañas de fundaciones con donaciones en custodia y liberación por hitos sobre los 4 contratos de `../contracts`, en Stellar Testnet.

**Stack:** Vite 8 + React 19 + TypeScript + Tailwind CSS 4, `@stellar/stellar-sdk` 17, `@stellar/freighter-api` 6 (wallet Varial, antes Freighter), Supabase (imágenes, redes, evidencia y RUT), TanStack Query y React Router.

## Pantallas

| Ruta | Para quién | Qué hace | Funciones del contrato |
| --- | --- | --- | --- |
| `/` | Todos | Inicio, campañas destacadas y cómo funciona | `get_campaign`, `get_vault` |
| `/campanas` | Donantes | Lista con filtros por etapa y búsqueda | `get_campaign`, `get_vault`, `get_profile` |
| `/campanas/:id` | Donantes | Detalle, ruta de los fondos, donar, historial y verificación de la evidencia | `quote`, `get_fee_bps`, `donate` |
| `/fundacion` | Fundaciones | Registro, estado de aprobación, crear campaña + abrir bóveda, subir evidencia, cancelar | `register_nonprofit`, `create_campaign`, `create_vault`, `submit_evidence`, `cancel_campaign` |
| `/admin` | Cuenta admin | Aprobar o revocar fundaciones, validar evidencia y liberar el 50% final | `approve_nonprofit`, `revoke_nonprofit`, `release_final`, `get_treasury` |
| `/mis-donaciones` | Donantes | Historial de la wallet conectada | eventos `DonationRouted` |
| `/como-funciona` | Todos | Modelo de confianza, preguntas frecuentes y comisión en vivo | `get_fee_bps` |

## Correr en local

Requisitos: Node 20+ y la extensión [Freighter](https://www.freighter.app/) configurada en **Testnet**.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # revisa tipos y genera dist/
```

No hace falta un `.env`: por defecto usa los contratos desplegados (README del monorepo). Para cambiar algo, copia `.env.example` como `.env.local`.

## Desplegar en Vercel

1. En Vercel: **Add New → Project** e importa `ThrivingHub/thriving-stellar`.
2. **Root Directory:** `frontend`. Vercel detecta Vite; `vercel.json` ya define `npm run build`, la salida `dist` y la regla para que las rutas (`/campanas/3`, etc.) no den 404.
3. Variables de entorno: opcionales, las de `.env.example`. Si se redespliegan los contratos, actualiza los `VITE_*_ID`.
4. **Deploy.** Cada push a `main` vuelve a publicar.

## Decisiones y límites (para el pitch y la demo)

- **Wallet:** Freighter. Las Passkeys de la guía quedan como siguiente paso.
- **Token:** XLM nativo de testnet (su contrato SAC `CDLZFC3S…CYSC`). Se cambia con `VITE_TOKEN_ADDRESS`.
- **Evidencia y RUT:** el navegador calcula el SHA-256 del archivo y solo esa huella va a la red; el archivo no se sube a ningún servidor. En el detalle de la campaña cualquiera puede comprobar un archivo contra la huella publicada.
- **Datos públicos:** razón social, NIT y correo de la fundación quedan públicos en la red.
- **Listado de campañas:** los contratos no tienen una función para listar, así que se consultan los IDs desde 1 hasta el primero que no existe.
- **Historial (donaciones, registros):** sale de los eventos del RPC, que en testnet guarda unos 7 días. El total recaudado siempre se lee del contrato.
- **Admin:** solo la cuenta `VITE_ADMIN_ADDRESS` (la `deployer`) ve el panel. Para la demo hay que importarla en Freighter o que Andrés firme esas acciones.
- **Límite L1 de los contratos:** si una campaña se cancela, la bóveda sigue aceptando depósitos; el frontend bloquea la donación revisando el estado de la campaña.
- **Monto máximo:** la bóveda rechaza depósitos que pasen la meta, así que el formulario limita la donación a lo que falta.

## Bindings

`src/contracts/*.ts` son copia de `../bindings/*/src/index.ts`. Si Andrés regenera los bindings:

```bash
npm run sync:bindings
```

## Entorno de demo (contratos de prueba)

Como los contratos oficiales tienen un solo admin (la cuenta de Andrés), hay una **copia de prueba** de los 4 contratos, desplegada desde el mismo wasm, con su propio admin y datos de ejemplo: 2 fundaciones (demo) y 5 campañas en todas las etapas.

```bash
npm run dev:demo     # local con los contratos de prueba (.env.demo)
npm run build:demo   # build con los contratos de prueba
npm run seed:demo    # vuelve a desplegar y cargar todo desde cero (crea cuentas nuevas)
```

- Publicado en: https://bitajon-demo.vercel.app
- `scripts/.demo-state.json` guarda las cuentas de prueba con sus llaves secretas de **testnet**. Está en `.gitignore`: no se sube.
- `demo-evidencia/` tiene los archivos cuya huella está registrada en las campañas 3 y 4, para probar «Comprobar un archivo de evidencia».

## Imágenes, redes sociales, evidencia y RUT (Supabase)

Los contratos solo guardan datos esenciales y huellas. Lo demás vive en Supabase (proyecto `mina-sin-fondo`, todo con prefijo `bitajon_`):

| Qué | Dónde | Quién lo ve | Quién lo escribe |
| --- | --- | --- | --- |
| Portada y galería de cada campaña | bucket público `bitajon-media` + tabla `bitajon_campaign_meta` | Todos | Solo la fundación dueña de la campaña (se comprueba on-chain) |
| Logo, descripción y redes de la fundación | `bitajon-media` + `bitajon_nonprofit_meta` | Todos | Solo esa fundación |
| Evidencia (fotos y PDF) + manifiesto | bucket público `bitajon-evidence` + `bitajon_evidence` | Todos | Solo la fundación dueña |
| RUT | bucket **privado** `bitajon-rut` + `bitajon_nonprofit_private` | **Solo el admin** (URL firmada de 10 min) | Solo esa fundación |

- **Cómo se autoriza:** la página pide a la wallet firmar un mensaje (SEP-53) una vez cada ~25 min. La Edge Function `supabase/functions/bitajon` verifica la firma (Ed25519), revisa en el contrato quién es dueño de la campaña o quién es el admin, y solo entonces entrega URLs de subida firmadas. Con la llave pública (anon) solo se puede leer.
- **Evidencia verificable:** se arma un manifiesto JSON con la huella SHA-256 de cada archivo; la huella del manifiesto es la que se registra con `submit_evidence`. El navegador del donante recalcula las huellas y muestra «Evidencia verificada».
- **RUT:** su huella queda en el contrato (`rut_hash`) al registrarse; el admin ve si el archivo guardado coincide.
- **Despliegues permitidos y admin por despliegue:** constante `CONFIGS` en la Edge Function. Si se redespliegan los contratos, hay que agregarlos ahí.
- **Admin:** puede cambiar fotos de cualquier campaña y el perfil/logo de cualquier fundación (botones en /admin y en cada campaña). El RUT solo lo sube la propia fundación.
- **Velocidad:** los eventos de los contratos (donaciones, hitos, registros) se copian en `bitajon_events`; la página los lee de ahí y en segundo plano pide `sync-events` para traer lo nuevo. Además guarda en el navegador lo último que vio (24 h) y lo muestra al instante mientras se actualiza.
- SQL: `supabase/migrations/20261106000000_bitajon_offchain.sql` y `20261106150000_bitajon_events_index.sql`. Contenido de demo: `npm run seed:media`.
