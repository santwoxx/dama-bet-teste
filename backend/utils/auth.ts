import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const FALLBACK_DEV_SECRET = 'damabet-super-secret-key-change-in-production';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  // SECURITY: this fallback secret is public (it's in the repo). Using it in
  // production means anyone can forge login tokens for any user, including admin.
  throw new Error(
    'JWT_SECRET environment variable is required in production. ' +
    'Set it in the Render dashboard before starting the server.'
  );
}

const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_DEV_SECRET;

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function signToken(payload: { userId: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  
  // Set default expiration to 30 days
  const expirationTime = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const payloadWithExp = {
    ...payload,
    exp: expirationTime,
  };
  
  const payloadStr = Buffer.from(JSON.stringify(payloadWithExp)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payloadStr}`)
    .digest('base64url');
    
  return `${header}.${payloadStr}.${signature}`;
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, payloadStr, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payloadStr}`)
      .digest('base64url');
      
    if (signature !== expectedSig) return null;
    
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.log('JWT Token expired.');
      return null;
    }
    
    return { userId: payload.userId };
  } catch (err) {
    return null;
  }
}

// Express Middleware to authenticate the request
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido.' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  req.userId = decoded.userId;
  next();
}
