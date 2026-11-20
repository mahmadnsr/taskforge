import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TaskChecklistItem {
  @Field(() => ID) id!: string;
  @Field(() => ID) organizationId!: string;
  @Field(() => ID) taskId!: string;
  @Field() content!: string;
  @Field() completed!: boolean;
  @Field(() => Int) position!: number;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class TaskChecklist {
  @Field(() => [TaskChecklistItem]) items!: TaskChecklistItem[];
  @Field(() => Int) completedCount!: number;
  @Field(() => Int) totalCount!: number;
}
