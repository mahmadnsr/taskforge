import { Field, ID, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

@InputType()
export class UpdateTaskCommentInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field(() => ID)
  @IsUUID()
  commentId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
