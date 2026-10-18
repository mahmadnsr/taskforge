import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { TaskPriority, TaskStatus } from '@prisma/client';

registerEnumType(TaskStatus, { name: 'TaskStatus' });
registerEnumType(TaskPriority, { name: 'TaskPriority' });

@ObjectType()
export class Task {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  organizationId!: string;

  @Field(() => ID)
  projectId!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => TaskStatus)
  status!: TaskStatus;

  @Field(() => TaskPriority)
  priority!: TaskPriority;

  @Field(() => ID)
  createdById!: string;

  @Field(() => ID, { nullable: true })
  assigneeId?: string | null;

  @Field(() => Date, { nullable: true })
  dueDate?: Date | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
