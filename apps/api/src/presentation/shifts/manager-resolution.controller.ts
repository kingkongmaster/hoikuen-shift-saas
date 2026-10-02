import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { ManagerResolutionService } from './manager-resolution.service';
class AnswerDto { @IsString() @MaxLength(100) option!:string; @IsOptional() @IsString() @MaxLength(5) time?:string; @IsOptional() @IsString() @MaxLength(5) startTime?:string; @IsOptional() @IsString() @MaxLength(5) endTime?:string; }
class RevisionDto { @IsInt() @Min(1) revision!:number; }
class MonthlySubmissionDto { @IsInt() @Min(0) revision!:number; @IsString() @MaxLength(64) inputDigest!:string; @IsString() @MaxLength(30) state!:string; }
class SubmitDto extends RevisionDto { @ValidateNested() @Type(()=>AnswerDto) answer!:AnswerDto; }
@Controller('manager-reviews')
@UseGuards(JwtAuthGuard,TenantAccessGuard,RolesGuard,SubscriptionWriteGuard)
@Roles('ADMIN')
export class ManagerResolutionController {
 constructor(private readonly service:ManagerResolutionService){}
 @Get(':month') list(@Req() req:{user:AuthenticatedUser},@Param('month') month:string){return this.service.list(req.user,month);}
 @Get(':month/submission') submission(@Req() req:{user:AuthenticatedUser},@Param('month') month:string){return this.service.submissions(req.user,month);}
 @Post(':month/submission/:category') submitMonth(@Req() req:{user:AuthenticatedUser},@Param('month') month:string,@Param('category') category:string,@Body() body:MonthlySubmissionDto){return this.service.submitMonth(req.user,month,category,body.revision,body.inputDigest,body.state);}
 @Get(':month/:id') detail(@Req() req:{user:AuthenticatedUser},@Param('month') month:string,@Param('id',new ParseUUIDPipe()) id:string){return this.service.detail(req.user,month,id);}
 @Post(':month/:id/answers') answer(@Req() req:{user:AuthenticatedUser},@Param('month') month:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:SubmitDto){return this.service.answer(req.user,month,id,body.revision,body.answer);}
 @Post(':month/:id/reevaluate') reevaluate(@Req() req:{user:AuthenticatedUser},@Param('month') month:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:RevisionDto){return this.service.reevaluate(req.user,month,id,body.revision);}
}
