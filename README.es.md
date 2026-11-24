# VM Shell (`space-ts` + `vm-pty-daemon`)

🌐 **Idioma:** Español | [English (EN)](README.md)

> **¿Qué hay realmente dentro de la celda Linux que controla Meta Muse?**  
> **VM Shell** te abre una terminal PTY real, interactiva y persistente dentro de un Space de Muse —en móvil o escritorio— **sin despertar al agente LLM ni gastar un solo token**.

> [!NOTE]
> **Proyecto experimental:** Construido y probado sobre el runtime Linux (`x86_64-unknown-linux-gnu`, `glibc 2.39`) de una VM de Meta Muse. Las rutas internas (`/opt/hatch/bin/*`, `~/workspace/your_files/`, etc.) pueden variar según el canal o despliegue de tu celda.

---

## El problema

Cada vez que le pides a Muse algo rutinario dentro de su VM —explorar carpetas, leer un `--help`, probar un `curl`, correr `git`, depurar un script o ver qué binarios existen en `/opt/`— se dispara un turno completo del modelo:
- Inyecta todo el contexto del sistema y quema tokens en tareas que no requieren IA.
- No te deja usar herramientas interactivas reales (`vim`, `top`, `python3`, `read`, prompts `[y/N]`).
- Desde el móvil, escribir flags o inspeccionar salidas largas en el chat es lento e incómodo.

---

## La solución

**VM Shell** reemplaza el chat por una consola real desacoplada dentro de un Space (`space-ts`):

- **PTY real + demonio maestro en Rust (`vm-pty-daemon`):** Un único demonio ligero por usuario administra hasta **8 sesiones PTY persistentes** (`openpty` + `setsid` + `TIOCSCTTY`) sobre un Unix Domain Socket privado (`0600` + `SO_PEERCRED`). Tus variables (`export`), `cd`, `venv`, historial de `bash` y procesos largos viven de verdad entre comandos.
- **Streaming por *long-polling* multiplexado:** Aunque el puente RPC de Muse corta cada petición a los **30 s**, el cliente (`xterm.js`) mantiene un único *long-polling* de ~18 s contra el demonio maestro para recibir salida en tiempo real de todas tus pestañas sin timeouts ni modo `BG`.
- **Anti-huérfanos y anti-OOM:** Buffer circular estricto de **1 MiB** por sesión, chunks acotados por RPC y un *watchdog* que, si cierras el Webview de golpe, limpia las shells a los **60 s** (`SIGHUP` → `SIGTERM` → `SIGKILL` por PGID) y apaga el demonio tras 120 s inactivo.
- **Pensada para móvil y escritorio:** Renderizado real con `@xterm/xterm`, barra táctil con teclas ANSI (`Esc`, `Tab`, `Ctrl`, `^C`, `^D`, flechas), pegado multilínea con *Bracketed Paste* + modal de respaldo para WebViews móviles, lector de salidas con formato JSON y guardado directo en Muse Library (`~/workspace/your_files/`).
- **Cero tokens LLM:** Todo corre directo en el runtime TypeScript/Bun + binario Rust del Space.

---

## Limitaciones y red externa (Sentinel)

- **Todo comando con salida a internet pasa por Sentinel:** Cualquier comando que intente salir a la web (`git`, `curl`, `bun install`, `pip`, etc.) hacia un dominio nunca autorizado dispara un **aviso de Sentinel solicitando permiso en todas tus ventanas de chat de Muse**. Mientras no lo apruebes, **el proceso en la terminal quedará colgado esperando** hasta agotar su tiempo de espera.
- **Sin puertos entrantes ni WebSockets directos:** La celda está aislada (`systemd-nspawn` + gate eBPF). Todo el tráfico de la terminal viaja sobre el RPC del Space mediante *long-polling* de ~18 s (no WebSocket nativo).
- **Límites de seguridad del demonio:** Máximo **8 terminales simultáneas**, buffer circular de **1 MiB** en RAM por sesión (en salidas masivas como `cat /dev/urandom` recorta lo más antiguo) y cierre automático de sesiones tras **60 s** sin cliente conectado.
- **Ciclo de vida efímero de la VM:** Muse reemplaza la celda periódicamente deteniendo procesos activos; solo sobrevive lo guardado bajo `/home/hatch` (`~`).

> [!WARNING]
> **Cuidado al aprobar dominios en Sentinel:**
> - Si solo vas a consultar una URL una vez, pulsa siempre **«Permitir una vez» (*Allow once*)**.
> - Si necesitas operaciones en varios pasos (como usar `git` para subir un commit a GitHub), puede ser necesario pulsar **«Permitir siempre» (*Allow always*)** mientras trabajas; **al terminar, revoca el PAT/token en GitHub y revoca el permiso del dominio**, porque **todo lo que apruebas en Sentinel queda aprobado también para el agente**, lo que le dejaría acceso a la sesión o credenciales configuradas en `git`.

---

## Instalación rápida (vía Muse)

1. **Precrea el Space genérico:** copia y pega lo siguiente en un chat limpio con Muse para registrar el `slug` y los permisos privilegiados:
   ```text
   Pide al subagente la creación de un space fullstack sencillo con slug vm-shell que simule una shell de terminal.
   ```
   *(Lo que cree no importa; solo necesitamos un Space registrado y con permisos en el backend de Meta.)*

2. **Cuando termine, pídele lo siguiente:**
   ```text
   Clona el repositorio https://github.com/dani-miraba/muse-vm-shell dentro de ~/workspace/ts-spaces/vm-shell/ reemplazando los archivos coincidentes, agregando los nuevos y manteniendo los no coincidentes. Al terminar, sigue los pasos de AGENTS.md.
   ```

3. **Qué hará según `AGENTS.md`:** limpiará la base inicial (`rm -f app.db*`), dará permisos de ejecución a `bin/vm-pty-daemon`, ejecutará `bun install && bun run typecheck` y compilará con `artifact.edit` (`web_artifacts.build`) sin editar los archivos fuente.

---

> [!CAUTION]
> **Úsalo bajo tu propio riesgo.** Este experimento está dirigido a quienes quieren husmear dentro de la celda (VM) que controla Muse. Si das permiso a un sitio externo en Sentinel, recuerda revocarlo cuando termines.

---

### Un dato curioso para terminar

Dentro de la celda existen herramientas, binarios y funciones que **la propia IA ni siquiera sabe que tiene** —y no las descubre hasta que entras a explorar por tu cuenta y le dices explícitamente qué tiene que hacer y qué comandos ejecutar.
