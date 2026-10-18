import { Equals, IsBoolean, IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';
export class TicketInput {
  @IsString() @Length(1,120) subject!:string;
  @IsIn(['操作方法','不具合','契約','改善要望','その他']) category!:string;
  @IsString() @Length(1,4000) body!:string;
}
export class ReplyInput {
  @IsString() @Length(1,4000) body!:string;
  @IsIn(['OPEN','IN_PROGRESS','RESOLVED']) status!:string;
}
export class ApplicationInput {
  @IsString() @Length(1,100) organization!:string;
  @IsString() @Length(1,100) contactName!:string;
  @IsEmail() @MaxLength(254) contactEmail!:string;
  @IsIn(['TRIAL','STANDARD','PROFESSIONAL']) requestedPlan!:string;
  @IsString() @MaxLength(100) version!:string;
  @IsString() @Length(64,64) hash!:string;
  @IsBoolean() @Equals(true) agreed!:boolean;
}
