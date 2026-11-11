# BITAJÓN · Frontend

Interfaz web de BITAJÓN: campañas de fundaciones con donaciones en custodia y liberación por hitos sobre los 5 contratos v0.2.1 de `../contracts`, en Stellar Testnet.

**Stack:** Vite 8 + React 19 + TypeScript + Tailwind CSS 4, `@stellar/stellar-sdk` 17, `@stellar/freighter-api` 6 (wallet Varial, antes Freighter), `@bluxcc/react` (login con correo), Supabase (imágenes, evidencia, RUT, índice de eventos y acciones de admin), TanStack Query y React Router.

## Pantallas

| Ruta | Para quién | Qué hace | Funciones del contrato |
| --- | --- | --- | --- |
| `/` | Todos | Inicio, campañas destacadas y cómo funciona | `get_campaign`, `get_vault` |
| `/campanas` | Donantes | Lista con filtros por etapa (incluye «Con reembolso») y búsqueda | `get_campaign`, `get_vault`, `get_profile` |
| `/campanas/:id` | Donantes | Detalle, ruta de los fondos, donar con equivalencia en COP/USD, historial y evidencia verificada | `quote`, `get_fee_bps`, `donate` |
| `/fundacion` | Fundaciones (correo o Varial) | Registro, crear campaña con % de primer desembolso (1–90), abrir bóveda con verificador, evidencia, cancelar, wallet de retiro | `register_nonprofit`, `create_campaign`, `create_vault`, `submit_evidence`, `cancel_campaign` |
| `/admin` | Admins de BITAJÓN | Aprobar/revocar, ver RUT y correo privados, validar evidencia y liberar el pago final, pausar campañas, fotos, admins | vía Edge Function: `approve_nonprofit`, `revoke_nonprofit`, `pause_vault`, `unpause_vault`, `set_verifier_for_campaign`, `release_final` |
| `/mis-donaciones` | Donantes | Historial y botón «Pedir reembolso» en campañas vencidas, canceladas o pausadas | eventos `DonationRouted`, `RefundClaimed`; `claim_refund` |
| `/como-funciona` | Todos | Modelo de confianza, preguntas frecuentes y comisión en vivo | `get_fee_bps` |

La página está en **español e inglés** (selector ES/EN) y muestra cada monto en XLM con su valor aproximado en **COP o USD** (selector en el encabezado, precio de CoinGecko con caché de 5 min en la Edge Function).

## Cómo entra cada quien

- **Donantes:** con su wallet (Varial).
- **Fundaciones:** con su **correo** (Blux crea y custodia la cuenta Stellar; no necesitan instalar nada) o con Varial. Si entraron con correo, en su panel pueden vincular su wallet y enviarse los fondos liberados.
- **Admins:** con Varial. La lista de admins está en Supabase (`bitajon_admins`) y se gestiona desde el panel.

## Admin multisig y cuenta del equipo

Desde v0.2 el admin de los contratos es el `governance-account` (multisig Ed25519), no una wallet. Para poder administrar desde la web:

1. La Edge Function `bitajon` genera una sola vez la **llave del equipo** y la guarda en Supabase (`bitajon_team_key`, sin acceso público). Nadie la ve.
2. Un firmante actual del governance la agrega como firmante (una vez):
   ```bash
   cd contracts/scripts && npm install
   node add-signer.mjs deployer <GOVERNANCE_ID> <llave pública hex que muestra /admin>
   ```
3. Desde ahí, el panel de admin pide al admin firmar un mensaje y la función firma la transacción por el governance (mismo flujo CAP-71 de `bootstrap.mjs`).
4. Esa misma cuenta es el **verificador** de las bóvedas que se crean desde la web, así que validar evidencia y liberar el resto es un clic. Se envía `expected_evidence` con la huella que el admin revisó.

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

- Proyecto `bitajon` (equipo mi-web3), **Root Directory** `frontend`, contratos oficiales: https://bitajon-blue.vercel.app
- Proyecto `bitajon-demo`, contratos de prueba con datos (`npm run build:demo`): https://bitajon-demo.vercel.app
- `.npmrc` usa `legacy-peer-deps` porque `@bluxcc/core` pide `@stellar/freighter-api@5` y aquí se usa la 6.
- **Despliegue automático desde `main`:** en Vercel → proyecto `bitajon` → Settings → Git → *Connect Git Repository* → `Bitajon/bitajon-stellar`. Requiere que alguien con permisos instale la app de Vercel en la organización Bitajon de GitHub. Cada push a `main` publica en producción y cada PR genera una vista previa.

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

Hay una **copia de prueba** de los 5 contratos v0.2.1 (desplegada con `contracts/scripts/bootstrap.mjs --from-release v0.2.1`) con su propio governance, donde la cuenta del equipo ya es firmante. Tiene 3 fundaciones (una pendiente) y 6 campañas en todas las etapas: activa, meta alcanzada, evidencia en revisión, completada, pausada y vencida con reembolso pendiente.

```bash
npm run dev:demo     # local con los contratos de prueba (.env.demo)
npm run build:demo   # build con los contratos de prueba
npm run seed:demo    # carga los datos de demo (reanudable)
```

- Publicado en: https://bitajon-demo.vercel.app
- `scripts/.demo-state.json` guarda las cuentas de prueba con sus llaves secretas de **testnet**. Está en `.gitignore`: no se sube.

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
- SQL: `supabase/migrations/20261106000000_bitajon_offchain.sql` y `20261106150000_bitajon_events_index.sql`. Y `20261111220000_bitajon_v02_admin.sql`. Datos de demo: `npm run seed:demo`.
