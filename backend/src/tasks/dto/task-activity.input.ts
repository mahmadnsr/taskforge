import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

@InputType()
export class TaskActivityInput {
  @Field(() => ID) @IsUUID() organizationId!: string;
  @Field(() => ID) @IsUUID() taskId!: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(100) first?: number;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(500) after?: string;
}
