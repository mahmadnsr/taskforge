import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class AssignTaskInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field(() => ID, { nullable: true })
  @IsUUID()
  assigneeId!: string | null;
}