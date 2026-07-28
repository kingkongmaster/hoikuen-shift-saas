import { plainToInstance, Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

const productionRequired = ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'WEB_ORIGIN', 'DEPLOYMENT_ENV', 'TRUST_PROXY', 'LOG_LEVEL'] as const;
const allowedLogLevels = new Set(['error', 'warn', 'log', 'debug', 'verbose']);

function invalid(message: string): never {
  throw new Error(`Invalid production environment: ${message}`);
}

function validateProduction(config: Record<string, unknown>): void {
  for (const key of productionRequired) if (typeof config[key] !== 'string' || !(config[key] as string).trim()) invalid(`${key} is required`);
  const secret = String(config.JWT_SECRET);
  const categoryCount = [/[a-z]/.test(secret), /[A-Z]/.test(secret), /[0-9]/.test(secret), /[^A-Za-z0-9]/.test(secret)].filter(Boolean).length;
  const strongHex = secret.length >= 64 && /^[a-f0-9]+$/i.test(secret) && new Set(secret.toLowerCase()).size >= 8;
  if (secret.length < 48 || (!strongHex && categoryCount < 3) || /(change|replace|example|placeholder)/i.test(secret)) invalid('JWT_SECRET does not meet the minimum strength policy');
  if (config.DEPLOYMENT_ENV !== 'production' && config.DEPLOYMENT_ENV !== 'staging') invalid('DEPLOYMENT_ENV must identify staging or production');
  const origins = String(config.WEB_ORIGIN).split(',').map((value) => value.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => origin.includes('*') || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin))) invalid('WEB_ORIGIN must contain explicit non-local origins');
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { invalid('WEB_ORIGIN contains an invalid URL'); }
    if (url.protocol !== 'https:') invalid('WEB_ORIGIN must use HTTPS');
    if (url.origin !== origin || url.username || url.password) invalid('WEB_ORIGIN entries must be origins without credentials, paths, queries, or fragments');
  }
  if (!/^[1-3]$/.test(String(config.TRUST_PROXY))) invalid('TRUST_PROXY must be a hop count from 1 to 3');
  if (!allowedLogLevels.has(String(config.LOG_LEVEL))) invalid('LOG_LEVEL is invalid');
}

class EnvironmentVariables {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsBooleanString()
  DATABASE_CONNECT_ON_STARTUP?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsString() WEB_ORIGIN?: string;
  @IsOptional() @IsString() DEPLOYMENT_ENV?: string;
  @IsOptional() @IsString() TRUST_PROXY?: string;
  @IsOptional() @IsString() LOG_LEVEL?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(10000) READINESS_DB_TIMEOUT_MS?: number;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const nodeEnvironment = typeof config.NODE_ENV === 'string' ? config.NODE_ENV.trim().toLowerCase() : '';
  const deploymentEnvironment = typeof config.DEPLOYMENT_ENV === 'string' ? config.DEPLOYMENT_ENV.trim().toLowerCase() : '';
  if (nodeEnvironment === 'production' || deploymentEnvironment === 'production' || deploymentEnvironment === 'staging') {
    if (config.NODE_ENV !== 'production') invalid('NODE_ENV must be exactly production for staging or production deployments');
    if (config.DEPLOYMENT_ENV !== deploymentEnvironment) invalid('DEPLOYMENT_ENV must use normalized lowercase without surrounding whitespace');
    validateProduction(config);
  }
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length) throw new Error(`Invalid environment variables: ${errors.map((error) => error.property).join(', ')}`);
  return validated;
}
