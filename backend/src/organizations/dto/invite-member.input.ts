import { Field, ID, InputType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsUUID } from 'class-validator';

@InputType()
export class InviteMemberInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field()
  @IsEmail()
  email!: string;

  @Field(() => Role)
  @IsEnum(Role)
  role!: Role;
}
