import { HttpError, MissionService } from './mission.ts';
import type { Dependencies } from './mission.ts';

export function createApi(deps: Dependencies, allowedOrigins: string[] = []) {
  const service = new MissionService(deps);
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const allowed = !origin || !allowedOrigins.length || allowedOrigins.includes(origin) || origin === new URL(request.url).origin;
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
      ...(allowed && origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (!allowed) throw new HttpError(403, 'Origen no autorizado.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const path = new URL(request.url).pathname.replace(/^\/\.netlify\/functions\/mission/, '/api').replace(/\/$/, '');
      if (path === '/api/health' && request.method === 'GET') return json({ version: 1, status: 'ok',
        capabilities: { vision: !!deps.vision, sensors: !!deps.predict } });
      if (path === '/api/active-session' && request.method === 'GET') return json(await service.getOrCreateActive());
      let body: Record<string, unknown> = {};
      if (request.method === 'POST') {
        if (Number(request.headers.get('Content-Length')) > 1000000) throw new HttpError(413, 'La petición es demasiado grande.');
        const text = await request.text();
        if (Buffer.byteLength(text) > 1000000) throw new HttpError(413, 'La petición es demasiado grande.');
        try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Se esperaba JSON válido.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'El cuerpo debe ser un objeto JSON.');
      }
      if (path === '/api/sessions' && request.method === 'POST') return json(await service.create(body), 201);
      const match = path.match(/^\/api\/sessions\/([\w-]+)(?:\/(control|heartbeat|context|vision|response|readings|self-report))?$/);
      if (!match) throw new HttpError(404, 'Ruta desconocida.');
      const key = request.headers.get('Authorization')?.match(/^Bearer ([\w-]+)$/)?.[1];
      if (!key) throw new HttpError(401, 'Falta la clave de sesión.');
      if (request.method === 'GET' && !match[2]) return json(await service.get(match[1], key));
      if (request.method === 'POST' && match[2]) return json(await service.action(match[1], key, match[2], body));
      throw new HttpError(405, 'Método no permitido.');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error('Mission API error:', e instanceof Error ? e.name : 'UnknownError');
      return json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' }, 500);
    }
  };
}
