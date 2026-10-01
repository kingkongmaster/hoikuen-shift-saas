import { Prisma, PrismaClient } from '@prisma/client';
import { validateItem, type ReviewItem } from './resolution';
import type { ResolutionStore, TransactionPort } from './resolution-store';
const prefix = 'MANAGER_REVIEW:';
/** No automatic retry: a serialization conflict requires refresh and explicit resubmission. */
export function prismaResolutionStore(prisma: PrismaClient): ResolutionStore {
  return {
    transaction<T>(run: (tx: TransactionPort) => Promise<T>): Promise<T> {
      return prisma.$transaction(async db => run({
        async load(tenantId,itemId) {
          const row=await db.tenantRuleException.findFirst({where:{id:itemId,tenantId,isActive:true,exceptionType:{startsWith:prefix}}});
          if(!row)return null;
          const item=row.configuration as unknown as ReviewItem;
          validateItem(item);
          if(item.id!==row.id||item.tenantId!==row.tenantId||item.revision!==row.version)throw new Error('REVIEW_STORAGE_MISMATCH');
          return item;
        },
        async compareAndSet(previous,next) {
          const result=await db.tenantRuleException.updateMany({where:{id:previous.id,tenantId:previous.tenantId,version:previous.revision,isActive:true,exceptionType:{startsWith:prefix}},data:{configuration:next as unknown as Prisma.InputJsonValue,version:next.revision}});
          return result.count===1;
        },
        async audit(event) {
          await db.auditLog.create({data:{tenantId:event.tenantId,memberId:event.memberId,action:event.action,targetType:'MonthlyManagerReview',targetId:event.targetId,detail:event.detail as Prisma.InputJsonValue}});
        },
      }),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    },
  };
}
