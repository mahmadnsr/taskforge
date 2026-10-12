import { Field, ID, InputType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

@InputType()
export class UpdateMemberRoleInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  userId!: string;

  @Field(() => Role)
  @IsEnum(Role)
  role!: Role;
}
