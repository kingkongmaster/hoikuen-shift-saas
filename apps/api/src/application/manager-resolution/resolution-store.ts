import { authorize, submitAnswer, type Actor, type Answer, type ReviewItem } from './resolution';
// Narrow port allows transaction-failure tests without exposing Prisma or a production connection.
export interface TransactionPort {
  load(tenantId: string, itemId: string): Promise<ReviewItem | null>;
  compareAndSet(previous: ReviewItem, next: ReviewItem): Promise<boolean>;
  audit(event: { tenantId: string; memberId: string; action: string; targetId: string; detail: unknown }): Promise<void>;
}
export interface ResolutionStore { transaction<T>(run: (tx: TransactionPort) => Promise<T>): Promise<T> }
export async function saveManagerAnswer(store: ResolutionStore, actor: Actor, itemId: string, revision: number, answer: Answer, now: string) {
  authorize(actor,actor.tenantId);
  return store.transaction(async tx=>{
    const item=await tx.load(actor.tenantId,itemId);
    if(!item) throw new Error('REVIEW_NOT_FOUND');
    const next=submitAnswer(item,actor,revision,answer,now);
    if(!await tx.compareAndSet(item,next)) throw new Error('REVIEW_REVISION_CONFLICT');
    await tx.audit({tenantId:actor.tenantId,memberId:actor.userId,action:'MONTHLY_MANAGER_ANSWERED',targetId:item.id,
      detail:{month:item.month,dates:item.dates,kind:item.kind,answer:next.answer,answeredAt:now,revision:next.revision,sourceReferences:item.sourceReferences}});
    return next;
  });
}
