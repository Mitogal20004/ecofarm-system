# Seguridad de E-farm

## Reglas de despliegue

- En producción, `NODE_ENV=production`, `FRONTEND_URL` debe contener únicamente orígenes HTTPS conocidos y `TRUST_PROXY=true` solo si existe un proxy confiable delante de la API.
- `SUPABASE_SECRET_KEY` vive exclusivamente en el backend. Nunca debe comenzar con `VITE_` ni incluirse en el frontend.
- La clave pública de Supabase no es un secreto, pero el acceso real depende de RLS, permisos de RPC y la validación del backend.
- La aplicación debe servirse exclusivamente por HTTPS.

## Capas implementadas

- CORS con lista explícita de orígenes.
- Cabeceras contra MIME sniffing, clickjacking, referer excesivo y APIs del navegador no utilizadas.
- HSTS en producción.
- Límite de cuerpo JSON de 256 KB.
- Límite de intentos por IP para login.
- Identificador `X-Request-Id` para correlacionar incidentes sin enviar trazas al cliente.
- Respuestas de autenticación con `Cache-Control: no-store`.
- RPC de Supabase con `SECURITY DEFINER`, `search_path` vacío y permisos explícitos.
- Revocación de acceso directo a tablas públicas para clientes.

## Operación

El rate limit en memoria protege una instancia individual. En producción con varias réplicas debe sustituirse por un limitador compartido basado en Redis o el proveedor de infraestructura.
