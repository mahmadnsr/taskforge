import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
IsInt,
IsOptional,
IsString,
IsUUID,
Max,
MaxLength,
Min,
} from 'class-validator';

@InputType()
export class TaskCommentsPaginationInput {
@Field(() => ID)
@IsUUID()
organizationId!: string;

@Field(() => ID)
@IsUUID()
taskId!: string;

@Field(() => Int, { defaultValue: 10 })
@IsOptional()
@IsInt()
@Min(1)
@Max(100)
first = 10;

@Field({ nullable: true })
@IsOptional()
@IsString()
@MaxLength(256)
after?: string;
}