import { IsObject } from 'class-validator';
export class BackupInputDto { @IsObject() backup!: Record<string, unknown>; }
