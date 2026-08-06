# MCPick

<!-- hy-mt2-i18n:start -->
[English](./README.md) | [中文](./README_zh-CN.md) | [日本語](./README_ja.md) | **Español**
<!-- hy-mt2-i18n:end -->


[![Desarrollado con Vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![Probado con Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

Gestor de configuración MCP independiente del proveedor con soporte de primera clase para Claude Code.

MCPick permite a los usuarios y agentes de LLM inspeccionar, activar/desactivar y hacer copias de seguridad de la configuración del servidor MCP en múltiples clientes de IA. Los complementos, ganchos, mercados y comandos de caché específicos para Claude Code siguen estando disponibles, pero ya no constituyen el modelo principal del producto.

## Instalación

```bash
npm install -g mcpick
# o ejecútalo sin instalarlo
npx mcpick --help
```

Requisitos:

- Node.js 22+
- Claude Code solo es necesario para los comandos específicos de este editor.
- La CLI de GitHub (`gh`, con autenticación) es necesaria para los comandos de habilidades portátiles; [check-skills](https://github.com/spences10/check-skills) verifica las habilidades antes de la instalación cuando estén disponibles.

## CLI centrada en los agentes

En entornos que no son TTY, MCPick muestra ayuda en lugar de iniciar la interfaz gráfica interactiva TUI. Esto la hace más segura para comandos como:

“Utilice mcpick para averiguar cómo habilitar este servidor MCP.”

Comenzar con:

```bash
npx mcpick --help
npx mcpick clients
npx mcpick list --json
```

MCPick oculta los patrones de información confidencial conocidos antes de mostrar la salida. Dado que las configuraciones MCP suelen contener variables de entorno y encabezados de autorización, los valores de `env` y `headers` se muestran como `***` en la salida en formato JSON.

## Clientes MCP

Adaptadores de cliente compatibles:

| Cliente               | Alcances             | Ejemplos de comandos                              |
| --------------------- | -------------------- | ------------------------------------------------- |
| Claude Code           | local, proyecto, usuario | `mcpick list`, `mcpick enable <server>`           |
| Gemini CLI            | proyecto, usuario       | `mcpick list --client gemini-cli --scope proyecto` |
| VS Code / Copilot     | proyecto              | `mcpick list --client vscode --scope proyecto`     |
| Cursor                | proyecto, usuario       | `mcpick list --client cursor --scope usuario`        |
| Windsurf              | usuario               | `mcpick list --client windsurf --scope usuario`      |
| OpenCode              | proyecto, usuario       | `mcpick list --client opencode --scope proyecto`   |
| Pi a través de pi-mcp-adapter | proyecto, usuario | `mcpick list --client pi --scope usuario`            |

Mostrar ubicaciones de configuración conocidas:

```bash
npx mcpick clients
npx mcpick clients --json
```

## Comandos del servidor MCP

```bash
# Listar el registro/estado de Claude Code
npx mcpick list
npx mcpick list --json

# Listar otro cliente
npx mcpick list --client pi --scope user --json
npx mcpick list --client opencode --scope project

# Habilitar/deshabilitar Claude Code
npx mcpick enable <server> --scope local
npx mcpick disable <server> --scope local

# Agregar/quitar definiciones de servidores Claude Code
npx mcpick add --name <server> --command npx --args "-y,package-name"
npx mcpick add-json <name> '{"command":"npx","args":["-y","package-name"]}'
npx mcpick remove <server>
```

MCPick emite una advertencia cuando un valor que ingresas parece ser un secreto, oculta la salida impresa, y `npx mcpick doctor` marca los secretos en texto plano que ya se encuentran en el disco. Para evitar que los secretos aparezcan en la línea de comandos ni en el contexto de la conversación del LLM, resuélvelos desde el entorno del proceso:

```bash
pnpx nopeek run.env --only GITHUB_TOKEN -- npx mcpick add --name github --command npx --args "-y,@modelcontextprotocol/server-github" --from-env GITHUB_TOKEN --yes
```

Los archivos de configuración del cliente MCP aún pueden almacenar contraseñas en texto plano, ya que así es como muchos clientes cargan actualmente las credenciales MCP; prefiera usar referencias `${VAR}` siempre que su cliente las soporte.

## Validar tu configuración

`npx mcpick doctor` verifica cada configuración de cliente conocida: la validez del JSON, la estructura del esquema por cliente, los comandos faltantes en PATH, los servidores duplicados entre diferentes ámbitos, las contraseñas en texto plano y los paquetes de servidores no anclados. Sale con un código distinto de cero cuando encuentra errores, por lo que funciona en entornos CI.

```bash
npx mcpick doctor
npx mcpick doctor --client cursor --json
```

## Habilidades portátiles

MCPick instala paquetes portátiles SKILL.md mediante los comandos `gh skill` de la CLI de GitHub. Las instalaciones se realizan en un directorio temporal y se validan con check-skills antes de que se escriba cualquier cosa en los directorios de su agente; además, cada instalación registra el origen (repositorio de origen, referencia fijada, agentes destino), lo cual se muestra en `skills list --json`.

```bash
# Listar las habilidades instaladas para un cliente
npx mcpick skills list --agent pi --json

# Buscar en GitHub o ver qué ofrece una fuente sin instalarla
npx mcpick skills search svelte
npx mcpick skills add spences10/skills --list
npx mcpick skills preview spences10/skills svelte-runes

# Instalar una habilidad, fijándola para garantizar reproductibilidad
npx mcpick skills add spences10/skills --agent pi --skill svelte-runes --pin v1.2.0 --yes

# Instalar todas las habilidades de un repositorio en el ámbito del usuario
npx mcpick skills add spences10/skills --agent opencode --all --global --yes

# Verificar si hay actualizaciones y aplicarlas
npx mcpick skills update --dry-run --json
npx mcpick skills update
```

El backend `gh skill` no admite la opción `skills remove`; en su lugar muestra los métodos manuales para eliminarlas.

## Herramientas específicas de Claude Code

Estos comandos abarcan los conceptos de Claude Code y están diseñados
intencionalmente para ser específicos del cliente:

```bash
# Complementos
npx mcpick plugins list
npx mcpick plugins install <name>@<marketplace>
npx mcpick plugins enable <name>@<marketplace>
npx mcpick plugins disable <name>@<marketplace>

# Plataformas de complementos
npx mcpick marketplace list
npx mcpick marketplace add <source>
npx mcpick marketplace update
npx mcpick marketplace remove <name>

# Ganchos y caché de complementos
npx mcpick hooks list
npx mcpick cache status
npx mcpick cache refresh
```

## Perfiles y copias de seguridad

Los perfiles son instantáneas portátiles del servidor MCP. El estado de los complementos de Claude Code se conserva como metadatos opcionales de perfil específicos de Claude.

```bash
# Los atajos antiguos de Claude Code siguen funcionando
npx mcpick --profile database
npx mcpick --save-profile mysetup
npx mcpick --list-profiles

# Guardar/cargar perfiles para un cliente MCP específico
npx mcpick profile save work --client vscode --scope project
npx mcpick profile load work --client opencode --scope project
npx mcpick profile load work --client pi --scope user

npx mcpick backup
npx mcpick restore [file]

# Crear copias de seguridad de despliegue seguras para versiones anteriores antes de las modificaciones de configuración
npx mcpick rollback --list
npx mcpick rollback [file]
```

## TUI interactiva

Al ejecutar `npx mcpick` en una terminal, se muestra el menú dirigido al usuario:

MCPick: Gestor de configuración MCP

¿Qué desea hacer?
  Activar/Desactivar servidores MCP
  Habilidades
  Herramientas específicas del cliente
  Cargar perfil
  Guardar perfil
  Hacer copia de seguridad de la configuración
  Restaurar desde la copia de seguridad
  Salir

El flujo principal de la interfaz gráfica es centrado en el cliente: primero se elige un cliente y luego se activan o desactivan sus servidores MCP. Los complementos, ganchos, mercados y caché de Claude Code se encuentran en la sección “Herramientas específicas del cliente”.

## Ubicaciones de la configuración

MCPick lee las ubicaciones estándar utilizadas por cada adaptador de cliente.  
Las rutas comunes incluyen:

| Ruta                     | Propósito                                         |
| ------------------------ | ----------------------------------------------- |
| `~/.claude.json`         | Configuración de MCP local o del usuario en Claude Code |
| `.mcp.json`              | Configuración de MCP del proyecto compartido      |
| `.gemini/settings.json`  | Configuración del proyecto para Gemini CLI        |
| `.vscode/mcp.json`       | Configuración del proyecto para VS Code / Copilot   |
| `.cursor/mcp.json`       | Configuración del proyecto Cursor                 |
| `opencode.json`          | Configuración del proyecto OpenCode               |
| `~/.config/mcp/mcp.json` | Configuración global de MCP compartida utilizada por pi-mcp-adapter |
| `.pi/mcp.json`           | Sobrescritura de la configuración del proyecto Pi |

Por compatibilidad histórica, el estado gestionado por MCPick se encuentra en `~/.claude/mcpick/`.

## Desarrollo

```bash
pnpm install
pnpm test
pnpm run check
pnpm build
```

Consulte `docs/VENDOR_NEUTRAL_ARCHITECTURE.md` para obtener notas sobre la arquitectura.
