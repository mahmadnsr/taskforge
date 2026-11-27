import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TaskActivityEntry {
  @Field(() => ID) id!: string;
  @Field(() => ID) taskId!: string;
  @Field(() => ID) organizationId!: string;
  @Field(() => ID) actorId!: string;
  @Field(() => String, { nullable: true }) actorName!: string | null;
  @Field() type!: string;
  @Field() details!: string;
  @Field() createdAt!: Date;
}

@ObjectType()
export class TaskActivityPage {
  @Field(() => [TaskActivityEntry]) items!: TaskActivityEntry[];
  @Field(() => String, { nullable: true }) nextCursor!: string | null;
  @Field() hasMore!: boolean;
}
