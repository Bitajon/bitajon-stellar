# BITAJÓN · Frontend

Interfaz web de BITAJÓN (Thriving Stellar): campañas de fundaciones con donaciones en custodia y liberación por hitos sobre los 4 contratos de `../contracts`, en Stellar Testnet.

**Stack:** Vite 8 + React 19 + TypeScript + Tailwind CSS 4, `@stellar/stellar-sdk` 17, `@stellar/freighter-api` 6, TanStack Query y React Router.

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
