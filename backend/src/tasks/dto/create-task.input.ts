import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskPriority } from '@prisma/client';

@InputType()
export class CreateTaskInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  projectId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Field(() => TaskPriority, { nullable: true })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;
}
