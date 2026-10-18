import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductOperationsService } from './product-operations.service';
import { ProductLegal } from './product-legal';
import { ProductSalesController, SupportController, PlatformSupportController } from './product-operations.controller';
@Module({imports:[AuthModule],controllers:[ProductSalesController,SupportController,PlatformSupportController],providers:[ProductOperationsService,ProductLegal]})
export class ProductOperationsModule {}
