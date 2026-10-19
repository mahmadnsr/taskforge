import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Task } from './task.entity.js';

@ObjectType()
export class PaginatedTasks {
  @Field(() => [Task])
  tasks!: Task[];

  @Field(() => Int)
  totalCount!: number;

  @Field()
  hasNextPage!: boolean;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;
}