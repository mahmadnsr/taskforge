import { Field, ObjectType } from '@nestjs/graphql';
import { TaskComment } from './task-comment.entity.js';

@ObjectType()
export class TaskCommentsPage {
  @Field(() => [TaskComment])
  items!: TaskComment[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;

  @Field()
  hasMore!: boolean;
}
