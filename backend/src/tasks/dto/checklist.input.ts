import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

@InputType()
export class ChecklistTaskInput {
  @Field(() => ID) @IsUUID() organizationId!: string;
  @Field(() => ID) @IsUUID() taskId!: string;
}

@InputType()
export class AddChecklistItemInput extends ChecklistTaskInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) content!: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(499) position?: number;
}

@InputType()
export class ChecklistItemInput extends ChecklistTaskInput {
  @Field(() => ID) @IsUUID() itemId!: string;
}

@InputType()
export class UpdateChecklistItemInput extends ChecklistItemInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) content!: string;
}

@InputType()
export class SetChecklistItemCompletedInput extends ChecklistItemInput {
  @Field() @IsBoolean() completed!: boolean;
}

@InputType()
export class ReorderChecklistItemsInput extends ChecklistTaskInput {
  @Field(() => [ID]) @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) itemIds!: string[];
}
