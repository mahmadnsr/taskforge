import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';
import { CreateTaskInput } from './create-task.input.js';

@InputType()
export class CreateSubtaskInput extends CreateTaskInput {
  @Field(() => ID)
  @IsUUID()
  parentId!: string;
}
