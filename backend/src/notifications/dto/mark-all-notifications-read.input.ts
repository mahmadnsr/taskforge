import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class MarkAllNotificationsReadInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;
}
