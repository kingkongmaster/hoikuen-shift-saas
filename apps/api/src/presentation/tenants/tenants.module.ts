import { ProductLegal } from '../product-operations/product-legal';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { ProvisionTenantService } from './provision-tenant.service';
@Module({ imports: [AuthModule], controllers: [TenantsController], providers: [ProductLegal, TenantsService, ProvisionTenantService] })
export class TenantsModule {}
