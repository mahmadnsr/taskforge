import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TaskComment {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  organizationId!: string;

  @Field(() => ID)
  taskId!: string;

  @Field(() => ID)
  authorId!: string;

  @Field()
  content!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
