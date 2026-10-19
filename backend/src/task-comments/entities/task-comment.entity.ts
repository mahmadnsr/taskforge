import { Field, ID, ObjectType } from '@nestjs/graphql';
import { CommentAuthor } from './comment-author.entity.js';

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

  @Field(() => CommentAuthor)
  author!: CommentAuthor;
}
