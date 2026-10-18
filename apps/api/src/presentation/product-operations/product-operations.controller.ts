import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { ApplicationInput, ReplyInput, TicketInput } from './product-operations.dto';
import { ProductOperationsService } from './product-operations.service';
import { ProductLegal } from './product-legal';
type R=Request & {user:AuthenticatedUser};
@Controller('product-sales')
export class ProductSalesController {
 constructor(private s:ProductOperationsService,private legal:ProductLegal){}
 @Get('terms') terms(){return this.legal.current();}
 @Post('applications') apply(@Body()input:ApplicationInput){return this.s.apply(input);}
}
@Controller('support/tickets') @UseGuards(JwtAuthGuard,TenantAccessGuard)
export class SupportController {
 constructor(private s:ProductOperationsService){}
 @Get() list(@Req()r:R){return this.s.list(r.user);}
 @Post() create(@Req()r:R,@Body()input:TicketInput){return this.s.create(r.user,input);}
 @Get(':id') detail(@Req()r:R,@Param('id',new ParseUUIDPipe())id:string){return this.s.detail(r.user,id);}
 @Post(':id/messages') reply(@Req()r:R,@Param('id',new ParseUUIDPipe())id:string,@Body()input:ReplyInput){return this.s.reply(r.user,id,input);}
}
@Controller('platform/support') @UseGuards(JwtAuthGuard,TenantAccessGuard)
export class PlatformSupportController {
 constructor(private s:ProductOperationsService){}
 @Get() list(@Req()r:R){return this.s.queue(r.user);}
 @Get('applications') applications(@Req()r:R){return this.s.applications(r.user);}
 @Get(':id') detail(@Req()r:R,@Param('id',new ParseUUIDPipe())id:string){return this.s.detail(r.user,id,true);}
 @Post(':id/messages') reply(@Req()r:R,@Param('id',new ParseUUIDPipe())id:string,@Body()input:ReplyInput){return this.s.reply(r.user,id,input,true);}
}
