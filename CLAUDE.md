# CLAUDE.md

## Proyecto

App de cuentas para autónomos y pymes: Next.js 16 (App Router) + React 19 en JavaScript, persistencia en Upstash Redis (prefijo `cuentas:`, claves por empresa), despliegue en Vercel.

- `app/` páginas y `app/api/` endpoints · `components/` UI · `lib/` lógica fiscal/contable, auth, persistencia · `data/` datos iniciales · `tests/` pruebas · `scripts/` utilidades.
- Tests: `npm test` (`node --test tests/*.test.mjs`). `npm run build` ejecuta los tests antes de compilar. E2E: `BASE=http://localhost:3001 npm run verificar` (necesita app local con BD vacía).
- `proxy.js` filtra acceso y origen: al tocar rutas, revisa también los permisos del endpoint.

## Roles: Claude dirige, Codex ayuda

- **Claude Code es el agente principal y director técnico.** El usuario habla solo con Claude.
- **Codex CLI es el agente auxiliar.** Claude decide el reparto sin preguntar al usuario.
- Para delegar, invoca el Skill `delegate-codex` (`~/.claude/skills/delegate-codex/SKILL.md`).
- **Esto aplica siempre, aunque el usuario no mencione a Codex.** Ante cada petición de desarrollo, Claude evalúa por su cuenta si conviene repartirla.

### Cuándo delegar

- **Tareas complejas** (varias piezas, varios módulos, mucho volumen): prioriza repartir el trabajo entre los dos agentes siempre que haya piezas independientes.
- **Tareas pequeñas** (un arreglo, un cambio en pocos archivos, una pregunta): Claude trabaja solo.

Ante una funcionalidad importante, Claude divide el trabajo y delega en Codex las tareas **independientes y bien acotadas**: tests de un módulo, un endpoint o componente aislado, utilidades en `lib/`, refactors mecánicos, documentación. Claude se queda con el diseño, la lógica fiscal delicada, lo que toque varias capas a la vez y la integración final. Tareas pequeñas o dependientes entre sí: no se delegan, Claude las hace directamente.

### Cómo delegar

1. Crear un worktree y una rama por tarea, fuera del repo:
   ```bash
   git worktree add ../cuentas-autonomos-wt/<rama> -b codex/<rama> main
   ```
2. Lanzar Codex en ese worktree, nunca en el directorio principal:
   ```bash
   codex exec --sandbox workspace-write -C ../cuentas-autonomos-wt/<rama> -o <scratchpad>/codex-<rama>.md "<encargo>"
   ```
   Para análisis sin cambios: `--sandbox read-only`.

### Modelo y consumo de cuota de Codex

Elegir el nivel más económico que garantice calidad. No pasar `-m`: usar la config o un perfil.

| Tarea | Cómo invocar | Modelo / razonamiento |
|---|---|---|
| Sencilla (tests de un módulo, refactor mecánico, docs) | `codex exec -p rapido …` | gpt-6-luna · medium |
| Funcionalidad normal | `codex exec …` (por defecto) | gpt-6.1-sol · medium |
| Funcionalidad normal con lógica delicada | `codex exec -c model_reasoning_effort=high …` | gpt-6.1-sol · high |
| Arquitectura, error especialmente difícil, o tarea que ya falló con un modelo más económico | `codex exec -p astra …` | gpt-6-astra · high |

- **Nunca** usar gpt-6-astra por defecto ni niveles `xhigh`/`max`/`ultra`.
- **Una sola instancia de Codex a la vez.** Varias en paralelo solo con autorización explícita del usuario.
- **Encargos acotados**: indicar en el prompt los archivos concretos que debe leer y tocar, y pedirle que no explore el resto del repositorio. Nada de análisis completos del repo si basta con unos archivos.
- **Reintentos**: si una tarea de Codex falla, como máximo **un** reintento (subiendo de nivel si procede, p. ej. a `-p astra`). Si vuelve a fallar, Claude la hace él o informa al usuario; no reintentar en bucle. **Nunca** usar `--dangerously-bypass-approvals-and-sandbox`.
3. El encargo incluye: objetivo, archivos que puede tocar (y los que no), criterios de aceptación y "ejecuta `npm test` antes de terminar". Sin secretos, claves ni credenciales en el prompt.
4. Dos agentes nunca trabajan en el mismo directorio ni en los mismos archivos a la vez. Claude trabaja en su propia rama (`claude/<tema>`).
5. Si Codex falla, Claude explica el fallo al usuario y continúa de forma segura (rehacer el encargo o hacerlo él).

### Ayudantes de Claude: Haiku y Sonnet (ahorro de cuota de Claude)

Claude (Opus) se reserva el trabajo difícil y pasa lo fácil a ayudantes más baratos con la herramienta Agent (`model: "haiku"` o `"sonnet"`), sin que el usuario tenga que pedirlo.

| Trabajo | Quién | Ejemplos |
|---|---|---|
| Búsqueda y lectura | **Haiku 5.5** | barrer el repo para localizar código, leer logs largos o salidas de tests/build, resumir archivos grandes, inventariar usos de una función |
| Implementación acotada y repetitiva | **Sonnet 5.5** (en su propio worktree: `isolation: "worktree"`) | tests de un módulo, cambios mecánicos en varios archivos según un patrón ya decidido, textos y estilos de UI, primera revisión de un diff buscando fallos evidentes |
| Diseño, lógica fiscal/contable, depuración, cambios que cruzan capas, revisión final e integración | **Claude (Opus)** | — |

- **No delegar lo trivial**: leer un archivo concreto o un `grep` puntual lo hace Claude directamente; lanzar un ayudante para eso gasta más.
- Los encargos a ayudantes siguen las mismas reglas que con Codex: objetivo, archivos concretos, criterios de aceptación, resumen breve como respuesta (no volcar archivos enteros).
- **Sonnet o Codex** para implementar: por defecto Codex (no consume cuota de Claude). Sonnet cuando la tarea necesita el contexto de esta conversación, cuando Codex no tiene cuota o cuando es tan pequeña que preparar el worktree de Codex no compensa.
- Todo lo que escriba un ayudante pasa por la revisión obligatoria de abajo, igual que lo de Codex.

### Revisión obligatoria

Claude revisa siempre el diff de Codex (`git -C <worktree> diff main...`), ejecuta `npm test` (y `npm run build` si toca páginas o rutas) y corrige o rechaza lo que no cumpla antes de integrarlo. Al terminar, informa al usuario de qué hizo cada agente.

## Git y GitHub

- Todo cambio va en una rama (`claude/…` o `codex/…`) y llega a `main` mediante pull request en `verticexp/cuentas-autonomos`.
- Claude **puede fusionar en `main` sin pedir permiso** (despliega en Vercel), siempre que haya revisado el trabajo (también el de Codex) y `npm test` y `npm run build` pasen. Codex nunca fusiona: lo hace Claude.
- Nunca `git push --force` a `main` ni reescribir su historia.
- Mantener las ramas sincronizadas con `origin/main` antes de abrir o actualizar un PR.
- Retirar los worktrees ya integrados con `git worktree remove` (solo los creados por Claude/Codex y tras confirmar que su rama está en un PR o fusionada).

## Seguridad

- No ejecutar comandos peligrosos (`rm -rf`, `git reset --hard`, `git push --force`, borrado de ramas remotas, operaciones sobre la BD de producción, etc.) sin consultar al usuario.
- No eliminar archivos del proyecto sin consultar al usuario.
- No leer ni pasar a Codex el contenido de `.env*` ni otros secretos.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
