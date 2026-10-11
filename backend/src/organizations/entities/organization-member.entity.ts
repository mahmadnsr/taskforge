import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { User } from '../../users/entities/user.entity.js';

registerEnumType(Role, { name: 'Role' });

@ObjectType()
export class OrganizationMember {
  @Field(() => ID)
  id!: string;

  @Field(() => Role)
  role!: Role;

  @Field(() => User)
  user!: User;
}
