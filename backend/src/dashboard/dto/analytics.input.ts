import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class TaskProgressInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  taskId!: string;
}

@InputType()
export class ProjectAnalyticsInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  projectId!: string;
}

@InputType()
export class EmployeeAnalyticsInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  employeeId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
