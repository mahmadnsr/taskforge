import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsUUID } from 'class-validator';
import { TaskStatus } from '@prisma/client';

@InputType()
export class ChangeTaskStatusInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field(() => TaskStatus)
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
