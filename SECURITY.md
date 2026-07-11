# Política de seguridad

## Versiones con soporte

| Versión | Soporte |
| --- | --- |
| 0.1.x | ✅ |

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad de seguridad en Marea, **no abras un issue
público**. Repórtala de forma privada:

1. **GitHub**: pestaña *Security* del repositorio → *Report a vulnerability*
   (aviso privado al mantenedor).
2. **Correo**: angelisaias27112000@gmail.com con el asunto `[SECURITY] Marea`.

Incluye si es posible: versión afectada, pasos para reproducir y el impacto
que estimas. Recibirás respuesta en un plazo aproximado de 7 días.

## Alcance

Marea es una aplicación de escritorio: opera sobre los repositorios y las
credenciales del propio usuario. Interesan especialmente reportes sobre:

- Ejecución de código a partir de contenido de un repositorio ajeno
  (mensajes de commit, nombres de rama, diffs, datos de PRs/issues…).
- Fugas de credenciales (tokens de cuentas, credenciales de git).
- Escapes del aislamiento del renderer (contextIsolation / IPC).
