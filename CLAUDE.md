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
   Para análisis sin cambios: `--sandbox read-only`. **Nunca** usar `--dangerously-bypass-approvals-and-sandbox`.
3. El encargo incluye: objetivo, archivos que puede tocar (y los que no), criterios de aceptación y "ejecuta `npm test` antes de terminar". Sin secretos, claves ni credenciales en el prompt.
4. Dos agentes nunca trabajan en el mismo directorio ni en los mismos archivos a la vez. Claude trabaja en su propia rama (`claude/<tema>`).
5. Si Codex falla, Claude explica el fallo al usuario y continúa de forma segura (rehacer el encargo o hacerlo él).

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
